"""
rca_store.py  –  Offline ChromaDB RCA store
============================================
Dependencies (pure PyPI, zero Hugging Face / GitHub downloads):
    pip install chromadb scikit-learn

How it works
------------
ChromaDB needs fixed-dimension float vectors.  We provide those with a
TF-IDF vectorizer (scikit-learn) that is fitted on the RCA corpus stored
locally in a small pickle file alongside the vector DB.

Why TF-IDF works well for RCAs
  - RCA documents contain very domain-specific vocabulary: "OOMKill",
    "BGP", "replication lag", "certificate expiry", etc.
  - TF-IDF with bigrams captures two-word technical phrases.
  - The corpus stays small (hundreds of docs), so re-fitting on startup
    takes < 1 second even on a laptop.

File layout (all local, nothing ever downloaded at runtime)
    ./rca_chroma_db/       ChromaDB persistent store
    ./rca_tfidf_state.pkl  Fitted TF-IDF vectorizer + corpus texts
"""

import os
import pickle
from collections import Counter
from typing import Optional

import numpy as np
import chromadb
from chromadb import Documents, EmbeddingFunction, Embeddings
from sklearn.feature_extraction.text import TfidfVectorizer

# ---------------------------------------------------------------------------
# Paths  (change these if you prefer a different location)
# ---------------------------------------------------------------------------

DB_PATH         = "./rca_chroma_db"
TFIDF_STATE     = "./rca_tfidf_state.pkl"
COLLECTION_NAME = "rca_documents"
TFIDF_DIM       = 8000   # vocabulary cap – increase for very large corpora


# ---------------------------------------------------------------------------
# Offline TF-IDF embedding function
# ---------------------------------------------------------------------------

class OfflineTFIDFEmbedder(EmbeddingFunction):
    """
    Custom ChromaDB embedding function backed by scikit-learn TF-IDF.

    The vectorizer is fitted on every document ever added to the store
    and persisted locally.  It never makes any network calls.

    IMPORTANT: call `.register_texts(texts)` before inserting new documents
    so the vectorizer vocabulary includes those texts.  `add_rca` and
    `add_rca_batch` do this automatically.
    """

    def __init__(self, state_path: str = TFIDF_STATE, dim: int = TFIDF_DIM):
        self.state_path = state_path
        self.dim = dim
        self._vectorizer: Optional[TfidfVectorizer] = None
        self._corpus: list[str] = []
        self._load()

    # ── Persistence ─────────────────────────────────────────────────────

    def _load(self) -> None:
        if os.path.exists(self.state_path):
            with open(self.state_path, "rb") as f:
                state = pickle.load(f)
            self._corpus     = state["corpus"]
            self._vectorizer = state["vectorizer"]

    def _save(self) -> None:
        with open(self.state_path, "wb") as f:
            pickle.dump(
                {"corpus": self._corpus, "vectorizer": self._vectorizer}, f
            )

    # ── Corpus management ───────────────────────────────────────────────

    def register_texts(self, texts: list[str]) -> None:
        """
        Add texts to the vocabulary and refit the vectorizer.
        Call this before inserting docs so their terms are in-vocabulary.
        """
        new = [t for t in texts if t not in self._corpus]
        if new:
            self._corpus.extend(new)
            self._refit()
            self._save()

    def _refit(self) -> None:
        self._vectorizer = TfidfVectorizer(
            ngram_range=(1, 2),     # unigrams + bigrams  e.g. "memory leak"
            max_features=self.dim,
            sublinear_tf=True,      # log(1+tf) – dampens very frequent terms
            strip_accents="unicode",
            analyzer="word",
        )
        self._vectorizer.fit(self._corpus)

    # ── ChromaDB interface ───────────────────────────────────────────────

    def __call__(self, input: Documents) -> Embeddings:
        """Transform texts to fixed-dim float vectors."""
        if self._vectorizer is None:
            # Cold start with only these docs – refit on them
            self._corpus = list(input)
            self._refit()

        sparse = self._vectorizer.transform(input).toarray()

        # Ensure exact fixed dimension (pad if vocab < dim)
        out = np.zeros((len(input), self.dim), dtype=np.float32)
        cols = min(sparse.shape[1], self.dim)
        out[:, :cols] = sparse[:, :cols]
        return out.tolist()


# ---------------------------------------------------------------------------
# Shared singletons  (one embedder + one collection per process)
# ---------------------------------------------------------------------------

_embedder:   Optional[OfflineTFIDFEmbedder] = None
_collection: Optional[chromadb.Collection]  = None


def _get_embedder() -> OfflineTFIDFEmbedder:
    global _embedder
    if _embedder is None:
        _embedder = OfflineTFIDFEmbedder()
    return _embedder


def get_collection() -> chromadb.Collection:
    """Return (or create) the persistent ChromaDB collection."""
    global _collection
    if _collection is None:
        client = chromadb.PersistentClient(path=DB_PATH)
        _collection = client.get_or_create_collection(
            name=COLLECTION_NAME,
            embedding_function=_get_embedder(),
            metadata={"hnsw:space": "cosine"},
        )
    return _collection


# ---------------------------------------------------------------------------
# Insert
# ---------------------------------------------------------------------------

def add_rca(
    doc_id: str,
    content: str,
    category: str,
    sub_category: str,
) -> None:
    """
    Insert (or update) a single RCA document.

    Parameters
    ----------
    doc_id       : unique identifier, e.g. "INC-2024-001"
    content      : full RCA text (timeline, impact, root cause, fix …)
    category     : e.g. "Database", "Network", "Application"
    sub_category : e.g. "Replication Lag", "BGP Misconfiguration"
    """
    embedder = _get_embedder()
    embedder.register_texts([content])   # update vocabulary first

    get_collection().upsert(
        ids=[doc_id],
        documents=[content],
        metadatas=[{"category": category, "subCategory": sub_category}],
    )
    print(f"[add_rca] Stored '{doc_id}'  ->  {category} / {sub_category}")


def add_rca_batch(records: list[dict]) -> None:
    """
    Bulk-insert a list of RCA dicts.

    Each dict must have keys:  id, content, category, subCategory

    Example
    -------
    add_rca_batch([
        {
            "id": "INC-001",
            "content": "Database OOMKilled by kernel due to unbounded query ...",
            "category": "Database",
            "subCategory": "Memory Exhaustion",
        },
        ...
    ])
    """
    embedder = _get_embedder()
    embedder.register_texts([r["content"] for r in records])

    get_collection().upsert(
        ids=[r["id"] for r in records],
        documents=[r["content"] for r in records],
        metadatas=[
            {"category": r["category"], "subCategory": r["subCategory"]}
            for r in records
        ],
    )
    print(f"[add_rca_batch] Stored {len(records)} documents.")


# ---------------------------------------------------------------------------
# Query
# ---------------------------------------------------------------------------

def find_similar_rcas(new_rca: str, top_k: int = 5) -> list[dict]:
    """
    Find the *top_k* most similar past RCAs for a free-text description.

    Returns a list of dicts sorted by descending similarity:
        [
            {
                "id":          "INC-003",
                "content":     "...",
                "category":    "Application",
                "subCategory": "Memory Leak",
                "similarity":  0.812,     # 1.0 = identical, 0.0 = unrelated
            },
            ...
        ]

    Parameters
    ----------
    new_rca : Free-text RCA description (does NOT need to be stored).
    top_k   : Number of results to return (capped at collection size).
    """
    col = get_collection()
    n_docs = col.count()

    if n_docs == 0:
        print("[find_similar_rcas] Collection is empty - add some RCAs first.")
        return []

    # Register query text so it is embedded in the same vector space
    _get_embedder().register_texts([new_rca])

    k = min(top_k, n_docs)
    results = col.query(
        query_texts=[new_rca],
        n_results=k,
        include=["documents", "metadatas", "distances"],
    )

    hits = []
    for i in range(len(results["ids"][0])):
        # ChromaDB cosine distance in [0, 2]  ->  similarity in [-1, 1]
        # For well-matched RCAs expect 0.4 - 0.9
        distance   = results["distances"][0][i]
        similarity = round(1.0 - distance / 2.0, 4)
        hits.append(
            {
                "id":          results["ids"][0][i],
                "content":     results["documents"][0][i],
                "category":    results["metadatas"][0][i]["category"],
                "subCategory": results["metadatas"][0][i]["subCategory"],
                "similarity":  similarity,
            }
        )

    return hits  # already sorted by similarity desc


# ---------------------------------------------------------------------------
# Category prediction
# ---------------------------------------------------------------------------

def predict_category(
    new_rca: str,
    top_k: int = 5,
    min_similarity: float = 0.20,
) -> dict:
    """
    Predict the category and subCategory for a new RCA.

    Algorithm
    ---------
    1. Retrieve the top_k most similar past RCAs.
    2. Discard matches below *min_similarity* (likely noise).
    3. Majority-vote on (category, subCategory) pairs.

    Returns
    -------
    {
        "predicted_category":    "Database" | None,
        "predicted_subCategory": "Replication Lag" | None,
        "confidence":            0.6,   # fraction of votes for the winner
        "votes":                 [("Database", "Replication Lag", 3), ...],
        "top_matches":           [...], # raw hits from find_similar_rcas
    }

    Parameters
    ----------
    new_rca        : Free-text RCA description.
    top_k          : How many similar RCAs to consider (default 5).
    min_similarity : Discard hits below this score (default 0.20).
                     Lower this if your corpus is small.
    """
    hits   = find_similar_rcas(new_rca, top_k=top_k)
    strong = [h for h in hits if h["similarity"] >= min_similarity]

    if not strong:
        return {
            "predicted_category":    None,
            "predicted_subCategory": None,
            "confidence":            0.0,
            "votes":                 [],
            "top_matches":           hits,
            "note": (
                f"No match scored >= {min_similarity}. "
                "Try lowering min_similarity or adding more RCAs."
            ),
        }

    vote_pairs        = [(h["category"], h["subCategory"]) for h in strong]
    counter           = Counter(vote_pairs)
    winner, win_count = counter.most_common(1)[0]

    votes_summary = [
        (cat, sub, cnt)
        for (cat, sub), cnt in counter.most_common()
    ]

    return {
        "predicted_category":    winner[0],
        "predicted_subCategory": winner[1],
        "confidence":            round(win_count / len(strong), 2),
        "votes":                 votes_summary,
        "top_matches":           hits,
    }


# ---------------------------------------------------------------------------
# Utility helpers
# ---------------------------------------------------------------------------

def list_all_rcas() -> list[dict]:
    """Return every stored RCA (useful for inspection / auditing)."""
    col = get_collection()
    if col.count() == 0:
        return []
    all_items = col.get(include=["documents", "metadatas"])
    return [
        {
            "id":          all_items["ids"][i],
            "content":     all_items["documents"][i],
            "category":    all_items["metadatas"][i]["category"],
            "subCategory": all_items["metadatas"][i]["subCategory"],
        }
        for i in range(len(all_items["ids"]))
    ]


def delete_rca(doc_id: str) -> None:
    """Remove a single RCA by ID."""
    get_collection().delete(ids=[doc_id])
    print(f"[delete_rca] Deleted '{doc_id}'")


def collection_stats() -> dict:
    """Quick info about the current store."""
    return {
        "collection":       COLLECTION_NAME,
        "db_path":          DB_PATH,
        "tfidf_state":      TFIDF_STATE,
        "total_docs":       get_collection().count(),
        "vocab_size":       len(_get_embedder()._corpus),
        "embedding_dim":    TFIDF_DIM,
        "requires_network": False,
    }


# ---------------------------------------------------------------------------
# Demo / quick-start  (run:  python rca_store.py)
# ---------------------------------------------------------------------------

if __name__ == "__main__":

    sample_rcas = [
        {
            "id": "INC-001",
            "content": (
                "Production database became unreachable for 45 minutes. "
                "A routine index rebuild job consumed all available I/O bandwidth, "
                "causing connection timeouts. Fixed by scheduling the job during "
                "off-peak hours and adding I/O throttling."
            ),
            "category": "Database",
            "subCategory": "Performance Degradation",
        },
        {
            "id": "INC-002",
            "content": (
                "Users unable to authenticate for 20 minutes. "
                "LDAP server certificate expired, causing all auth requests to fail "
                "silently. Fixed by renewing the certificate and adding expiry monitoring."
            ),
            "category": "Authentication",
            "subCategory": "Certificate Expiry",
        },
        {
            "id": "INC-003",
            "content": (
                "API gateway returned 502 errors for 30 minutes. "
                "Memory leak in the order-service caused pods to OOMKill faster "
                "than Kubernetes could reschedule them. Fixed by patching the memory "
                "leak and adding memory limit alerts."
            ),
            "category": "Application",
            "subCategory": "Memory Leak",
        },
        {
            "id": "INC-004",
            "content": (
                "Intermittent packet loss between data-centre zones for 1 hour. "
                "A misconfigured BGP route advertisement caused traffic to loop "
                "between two core routers. Fixed by correcting BGP policy and "
                "adding route-change alerting."
            ),
            "category": "Network",
            "subCategory": "BGP Misconfiguration",
        },
        {
            "id": "INC-005",
            "content": (
                "Nightly ETL pipeline failed and no data was loaded into the warehouse. "
                "A schema change in the source database was not propagated to the "
                "pipeline mapping. Fixed by updating the mapping and adding "
                "schema-drift detection."
            ),
            "category": "Database",
            "subCategory": "Schema Drift",
        },
        {
            "id": "INC-006",
            "content": (
                "Storage cluster went read-only for 15 minutes. "
                "Disk usage hit the 95% threshold triggering a safety lock. "
                "Fixed by archiving old logs to cold storage and setting an 80% "
                "usage alert."
            ),
            "category": "Infrastructure",
            "subCategory": "Disk Space Exhaustion",
        },
        {
            "id": "INC-007",
            "content": (
                "Database replication lag exceeded 10 minutes on the replica. "
                "A large bulk-delete operation on the primary generated enormous "
                "binary log events that overwhelmed the replica apply thread. "
                "Fixed by breaking bulk operations into smaller batches."
            ),
            "category": "Database",
            "subCategory": "Replication Lag",
        },
        {
            "id": "INC-008",
            "content": (
                "SSL handshake failures for external customers for 2 hours. "
                "Load balancer TLS certificate was not renewed after the auto-renewal "
                "cron job silently failed. Fixed by repairing the cron and adding "
                "certificate expiry alerting."
            ),
            "category": "Authentication",
            "subCategory": "Certificate Expiry",
        },
    ]

    print("Seeding database ...")
    add_rca_batch(sample_rcas)

    print("\nCollection stats:")
    for k, v in collection_stats().items():
        print(f"  {k}: {v}")

    # Simulate predicting the category of a brand-new RCA
    new_rca_text = """
    Incident: Reporting service started timing out at 03:45 UTC.
    Impact: Finance team unable to generate end-of-month reports for 90 minutes.
    Root Cause: An unoptimised ad-hoc query triggered by a new dashboard widget
    caused a full table scan on the 500M-row transactions table, consuming all DB
    CPU and blocking other queries.
    Resolution: Killed the runaway query, added a covering index, and restricted
    ad-hoc query execution time to 30 seconds.
    """

    print("\nTop-5 similar RCAs:")
    matches = find_similar_rcas(new_rca_text, top_k=5)
    for m in matches:
        print(
            f"  [{m['similarity']:.3f}]  {m['id']:8s}  "
            f"->  {m['category']} / {m['subCategory']}"
        )

    print("\nCategory prediction:")
    pred = predict_category(new_rca_text, top_k=5)
    print(f"  Predicted category    : {pred['predicted_category']}")
    print(f"  Predicted subCategory : {pred['predicted_subCategory']}")
    print(f"  Confidence            : {pred['confidence'] * 100:.0f}%")
    print(f"  Vote breakdown        : {pred['votes']}")