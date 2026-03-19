"""
rca_store.py
------------
Persistent ChromaDB store for IT Incident Root Cause Analysis (RCA) documents.

Features:
  - Add RCA documents with category and subCategory metadata
  - Query a new RCA string and get the top-N most similar past RCAs
  - Predict category/subCategory from the top-5 matches using majority vote
"""

import chromadb
from chromadb.utils import embedding_functions
from collections import Counter
from typing import Optional


# ---------------------------------------------------------------------------
# Configuration
# ---------------------------------------------------------------------------

DB_PATH        = "./rca_chroma_db"          # folder where ChromaDB persists data
COLLECTION_NAME = "rca_documents"
EMBED_MODEL    = "all-MiniLM-L6-v2"         # fast, good quality sentence embeddings


# ---------------------------------------------------------------------------
# Client & collection setup
# ---------------------------------------------------------------------------

def get_collection() -> chromadb.Collection:
    """Return (or create) the persistent ChromaDB collection."""
    client = chromadb.PersistentClient(path=DB_PATH)

    ef = embedding_functions.SentenceTransformerEmbeddingFunction(
        model_name=EMBED_MODEL
    )

    collection = client.get_or_create_collection(
        name=COLLECTION_NAME,
        embedding_function=ef,
        metadata={"hnsw:space": "cosine"},   # cosine similarity for text
    )
    return collection


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
    Insert a single RCA document into ChromaDB.

    Parameters
    ----------
    doc_id      : unique identifier (e.g. "INC-20240315-001")
    content     : full RCA text (timeline, impact, root cause, fix, …)
    category    : e.g. "Network", "Database", "Application"
    sub_category: e.g. "DNS Failure", "Replication Lag", "Memory Leak"
    """
    collection = get_collection()
    collection.upsert(                        # upsert = safe re-insert
        ids=[doc_id],
        documents=[content],
        metadatas=[{
            "category":    category,
            "subCategory": sub_category,
        }],
    )
    print(f"[add_rca] Stored '{doc_id}' → {category} / {sub_category}")


def add_rca_batch(records: list[dict]) -> None:
    """
    Bulk-insert a list of RCA dicts.

    Each dict must have keys: id, content, category, subCategory
    """
    collection = get_collection()

    ids        = [r["id"]          for r in records]
    docs       = [r["content"]     for r in records]
    metadatas  = [{"category": r["category"], "subCategory": r["subCategory"]}
                  for r in records]

    collection.upsert(ids=ids, documents=docs, metadatas=metadatas)
    print(f"[add_rca_batch] Stored {len(records)} documents.")


# ---------------------------------------------------------------------------
# Query
# ---------------------------------------------------------------------------

def find_similar_rcas(
    new_rca: str,
    top_k: int = 5,
) -> list[dict]:
    """
    Find the *top_k* most similar past RCAs for the given text.

    Returns a list of dicts, each containing:
        id, content, category, subCategory, similarity_score
    Sorted by descending similarity (score closer to 1.0 = more similar).
    """
    collection = get_collection()
    n_docs = collection.count()

    if n_docs == 0:
        print("[find_similar_rcas] Collection is empty – add some RCAs first.")
        return []

    k = min(top_k, n_docs)

    results = collection.query(
        query_texts=[new_rca],
        n_results=k,
        include=["documents", "metadatas", "distances"],
    )

    hits = []
    for i in range(len(results["ids"][0])):
        distance = results["distances"][0][i]        # cosine distance  [0, 2]
        similarity = 1 - (distance / 2)              # map to  [-1, 1]  (>0.7 = good match)
        hits.append({
            "id":           results["ids"][0][i],
            "content":      results["documents"][0][i],
            "category":     results["metadatas"][0][i]["category"],
            "subCategory":  results["metadatas"][0][i]["subCategory"],
            "similarity":   round(similarity, 4),
        })

    return hits


# ---------------------------------------------------------------------------
# Prediction via majority vote
# ---------------------------------------------------------------------------

def predict_category(
    new_rca: str,
    top_k: int = 5,
    min_similarity: float = 0.30,          # ignore hits below this threshold
) -> dict:
    """
    Predict the category and subCategory for a new RCA.

    Strategy: retrieve top_k similar RCAs, filter by min_similarity,
    then pick the most frequent (category, subCategory) pair.

    Returns
    -------
    {
        "predicted_category":    str | None,
        "predicted_subCategory": str | None,
        "confidence":            float,      # fraction of votes for winner
        "top_matches":           list[dict], # raw similarity hits
    }
    """
    hits = find_similar_rcas(new_rca, top_k=top_k)

    # Filter weak matches
    strong = [h for h in hits if h["similarity"] >= min_similarity]

    if not strong:
        return {
            "predicted_category":    None,
            "predicted_subCategory": None,
            "confidence":            0.0,
            "top_matches":           hits,
            "note": "No matches above similarity threshold.",
        }

    # Majority vote on (category, subCategory) pair
    votes = [(h["category"], h["subCategory"]) for h in strong]
    most_common_pair, vote_count = Counter(votes).most_common(1)[0]

    return {
        "predicted_category":    most_common_pair[0],
        "predicted_subCategory": most_common_pair[1],
        "confidence":            round(vote_count / len(strong), 2),
        "top_matches":           hits,
    }


# ---------------------------------------------------------------------------
# Utility helpers
# ---------------------------------------------------------------------------

def list_all_rcas() -> list[dict]:
    """Return every document in the collection (for debugging / inspection)."""
    collection = get_collection()
    if collection.count() == 0:
        return []
    all_items = collection.get(include=["documents", "metadatas"])
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
    """Remove a single RCA document by ID."""
    get_collection().delete(ids=[doc_id])
    print(f"[delete_rca] Deleted '{doc_id}'")


def collection_stats() -> dict:
    """Quick stats about the current collection."""
    col = get_collection()
    return {
        "collection": COLLECTION_NAME,
        "db_path":    DB_PATH,
        "total_docs": col.count(),
        "embed_model": EMBED_MODEL,
    }


# ---------------------------------------------------------------------------
# Demo / quick-start
# ---------------------------------------------------------------------------

if __name__ == "__main__":
    # ── Seed with sample RCA data ──────────────────────────────────────────
    sample_rcas = [
        {
            "id": "INC-001",
            "content": (
                "Incident: Production database became unreachable for 45 minutes. "
                "Root Cause: A routine index rebuild job consumed all available I/O "
                "bandwidth, causing connection timeouts. Fix: Scheduled the job during "
                "off-peak hours and added I/O throttling."
            ),
            "category": "Database",
            "subCategory": "Performance Degradation",
        },
        {
            "id": "INC-002",
            "content": (
                "Incident: Users unable to authenticate for 20 minutes. "
                "Root Cause: LDAP server certificate expired, causing all auth requests "
                "to fail silently. Fix: Renewed certificate and added expiry monitoring."
            ),
            "category": "Authentication",
            "subCategory": "Certificate Expiry",
        },
        {
            "id": "INC-003",
            "content": (
                "Incident: API gateway returned 502 errors for 30 minutes. "
                "Root Cause: Memory leak in the order-service caused pods to OOMKill "
                "faster than Kubernetes could reschedule them. Fix: Patched memory leak "
                "and added memory limit alerts."
            ),
            "category": "Application",
            "subCategory": "Memory Leak",
        },
        {
            "id": "INC-004",
            "content": (
                "Incident: Intermittent packet loss between data-centre zones for 1 hour. "
                "Root Cause: A misconfigured BGP route advertisement caused traffic to "
                "loop between two core routers. Fix: Corrected BGP policy and added "
                "route-change alerting."
            ),
            "category": "Network",
            "subCategory": "BGP Misconfiguration",
        },
        {
            "id": "INC-005",
            "content": (
                "Incident: Nightly ETL pipeline failed, no data loaded into the warehouse. "
                "Root Cause: A schema change in the source DB was not propagated to the "
                "pipeline mapping. Fix: Updated mapping and added schema-drift detection."
            ),
            "category": "Database",
            "subCategory": "Schema Drift",
        },
        {
            "id": "INC-006",
            "content": (
                "Incident: Storage cluster went read-only for 15 minutes. "
                "Root Cause: Disk usage hit the 95% threshold triggering a safety lock. "
                "Fix: Archived old logs to cold storage and set 80% usage alert."
            ),
            "category": "Infrastructure",
            "subCategory": "Disk Space Exhaustion",
        },
        {
            "id": "INC-007",
            "content": (
                "Incident: Database replication lag exceeded 10 minutes on replica. "
                "Root Cause: A large bulk-delete operation on the primary generated "
                "enormous binary log events that overwhelmed the replica's apply thread. "
                "Fix: Broke bulk operations into smaller batches."
            ),
            "category": "Database",
            "subCategory": "Replication Lag",
        },
        {
            "id": "INC-008",
            "content": (
                "Incident: SSL handshake failures for external customers for 2 hours. "
                "Root Cause: Load balancer TLS certificate was not renewed after "
                "auto-renewal cron job silently failed. Fix: Fixed cron, added cert "
                "expiry alerting."
            ),
            "category": "Authentication",
            "subCategory": "Certificate Expiry",
        },
    ]

    add_rca_batch(sample_rcas)

    print("\n── Collection stats ──")
    print(collection_stats())

    # ── Query a brand-new RCA ──────────────────────────────────────────────
    new_rca_text = """
    Incident: Reporting service started timing out at 03:45 UTC.
    Impact: Finance team unable to generate end-of-month reports for 90 minutes.
    Root Cause: An unoptimised ad-hoc query triggered by a new dashboard widget
    caused a full table scan on a 500M-row transactions table, consuming all DB
    CPU and blocking other queries.
    Resolution: Killed the runaway query, added a covering index, and restricted
    ad-hoc query execution time to 30 seconds.
    """

    print("\n── Top-5 similar RCAs ──")
    matches = find_similar_rcas(new_rca_text, top_k=5)
    for m in matches:
        print(f"  [{m['similarity']:.3f}]  {m['id']}  "
              f"→ {m['category']} / {m['subCategory']}")

    print("\n── Category prediction ──")
    prediction = predict_category(new_rca_text, top_k=5)
    print(f"  Predicted category    : {prediction['predicted_category']}")
    print(f"  Predicted subCategory : {prediction['predicted_subCategory']}")
    print(f"  Confidence            : {prediction['confidence'] * 100:.0f}%")