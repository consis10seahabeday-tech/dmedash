"""
rca_store.py  –  LSTM-based IT Incident RCA Classifier
=======================================================
Pure-Python implementation.  No Hugging Face, no PyTorch, no TensorFlow.

Dependencies (plain PyPI, firewall-safe):
    pip install scikit-learn numpy chromadb

Architecture
------------
                      ┌──────────┐
  RCA text  ──tok──►  │ Embedding│  (vocab_size × embed_dim, learned)
                      └────┬─────┘
                           │  token sequence
                      ┌────▼─────┐
                      │   LSTM   │  (hidden_size=64, single layer)
                      └────┬─────┘
                           │  final hidden state h_T
                      ┌────▼─────┐
                      │  Dense   │  (n_classes) + softmax
                      └────┬─────┘
                    category / subCategory

Training
--------
  - Cross-entropy loss
  - Backpropagation Through Time (BPTT) — hand-rolled in numpy
  - Gradient clipping (±5) to prevent exploding gradients
  - SGD with configurable learning rate and epochs
  - Weights persisted as a .pkl alongside the DB so the model survives restarts

Similarity search (ChromaDB)
-----------------------------
  The LSTM final hidden state is also stored as a vector in ChromaDB.
  This lets you do `find_similar_rcas()` — semantic nearest-neighbour
  search — in addition to hard classification via `predict_category()`.

File layout
-----------
  ./rca_chroma_db/      ChromaDB vector store  (similarity search)
  ./rca_lstm_state.pkl  LSTM weights + vocabulary + label encoders
"""

import os
import pickle
from collections import Counter
from typing import Optional

import numpy as np
import chromadb
from chromadb import Documents, EmbeddingFunction, Embeddings
from sklearn.feature_extraction.text import CountVectorizer
from sklearn.preprocessing import LabelEncoder

# ---------------------------------------------------------------------------
# Config
# ---------------------------------------------------------------------------

DB_PATH        = "./rca_chroma_db"
MODEL_PATH     = "./rca_lstm_state.pkl"
COLLECTION_NAME = "rca_documents"

# LSTM hyper-parameters (reasonable defaults for small IT corpora)
VOCAB_SIZE  = 3000   # max unique tokens
EMBED_DIM   = 32     # token embedding size
HIDDEN_SIZE = 64     # LSTM hidden units
MAXLEN      = 60     # max tokens per RCA (longer docs are truncated)
LR          = 0.03   # learning rate
EPOCHS      = 150    # training epochs per fit() call
GRAD_CLIP   = 5.0    # gradient clipping threshold


# ---------------------------------------------------------------------------
# LSTM implementation (pure numpy)
# ---------------------------------------------------------------------------

class LSTMClassifier:
    """
    Single-layer LSTM text classifier implemented from scratch in numpy.

    Parameters
    ----------
    vocab_size  : Number of unique tokens (including padding token 0).
    embed_dim   : Dimension of token embeddings.
    hidden_size : LSTM hidden state size.
    n_classes   : Number of output classes.
    """

    def __init__(
        self,
        vocab_size:  int,
        embed_dim:   int,
        hidden_size: int,
        n_classes:   int,
    ):
        self.vocab_size  = vocab_size
        self.embed_dim   = embed_dim
        self.hidden_size = hidden_size
        self.n_classes   = n_classes

        sz = hidden_size
        iz = hidden_size + embed_dim          # concatenated input size

        # Embedding matrix  (row = token embedding)
        self.E  = self._xavier(vocab_size, embed_dim)

        # LSTM gates packed into one matrix for speed
        # Row order: [forget | input | cell | output]
        self.W  = self._xavier(4 * sz, iz)
        self.b  = np.zeros(4 * sz)

        # Output (classification) layer
        self.Wy = self._xavier(n_classes, sz)
        self.by = np.zeros(n_classes)

    # ── Weight initialisation ────────────────────────────────────────────

    @staticmethod
    def _xavier(rows: int, cols: int) -> np.ndarray:
        """Xavier / Glorot uniform initialisation."""
        return np.random.randn(rows, cols) * np.sqrt(2.0 / (rows + cols))

    # ── Core forward pass ────────────────────────────────────────────────

    def _step(
        self,
        x: np.ndarray,
        h: np.ndarray,
        c: np.ndarray,
    ):
        """One LSTM time step.  Returns (h_new, c_new, cache)."""
        sz  = self.hidden_size
        z   = np.concatenate([h, x])
        raw = self.W @ z + self.b

        f = self._sigmoid(raw[0*sz : 1*sz])   # forget gate
        i = self._sigmoid(raw[1*sz : 2*sz])   # input  gate
        g = np.tanh(raw[2*sz : 3*sz])         # cell   gate
        o = self._sigmoid(raw[3*sz : 4*sz])   # output gate

        c_new = f * c + i * g
        h_new = o * np.tanh(c_new)
        return h_new, c_new, (x, h, c, f, i, g, o, h_new, c_new)

    def forward(self, token_ids: np.ndarray):
        """
        Forward pass over a token sequence.

        Parameters
        ----------
        token_ids : 1-D int array of length MAXLEN

        Returns
        -------
        probs   : softmax probability vector  (n_classes,)
        h_last  : final hidden state          (hidden_size,)  ← used as embedding
        cache   : list of per-step caches     (used in BPTT)
        """
        h, c  = np.zeros(self.hidden_size), np.zeros(self.hidden_size)
        cache = []
        for t in token_ids:
            x         = self.E[t]
            h, c, step_cache = self._step(x, h, c)
            cache.append((t, step_cache))

        logits = self.Wy @ h + self.by
        probs  = self._softmax(logits)
        return probs, h, cache

    # ── Backward pass (BPTT) ─────────────────────────────────────────────

    def backward(
        self,
        token_ids: np.ndarray,
        y_true:    int,
    ):
        """
        Compute cross-entropy loss and gradients via BPTT.

        Returns
        -------
        loss : scalar float
        grads: dict of gradient arrays keyed by parameter name
        """
        probs, h_last, cache = self.forward(token_ids)
        loss = -np.log(probs[y_true] + 1e-9)

        sz = self.hidden_size

        # ── Output layer ─────────────────────────────────────
        d_logits      = probs.copy()
        d_logits[y_true] -= 1.0          # d(cross-entropy) / d(logits)

        dWy = np.outer(d_logits, h_last)
        dby = d_logits.copy()
        dh  = self.Wy.T @ d_logits       # gradient flowing back into h_T

        # ── BPTT through time steps ───────────────────────────
        dW  = np.zeros_like(self.W)
        db  = np.zeros_like(self.b)
        dE  = np.zeros_like(self.E)
        dc  = np.zeros(sz)               # gradient of cell state

        for token_id, (x, h_prev, c_prev, f, i, g, o, h_t, c_t) in reversed(cache):
            # h gradient from above (output layer or next step)
            dh_t = dh
            do   = dh_t * np.tanh(c_t)
            dc  += dh_t * o * (1.0 - np.tanh(c_t) ** 2)

            df   = dc * c_prev
            di   = dc * g
            dg   = dc * i
            dc   = dc * f                # propagate cell grad backward

            # Pre-activation gradients  (gate derivative × upstream)
            raw_grads = np.concatenate([
                df * f * (1.0 - f),      # forget
                di * i * (1.0 - i),      # input
                dg * (1.0 - g ** 2),     # cell  (tanh derivative)
                do * o * (1.0 - o),      # output
            ])

            z   = np.concatenate([h_prev, x])
            dW += np.outer(raw_grads, z)
            db += raw_grads

            dz  = self.W.T @ raw_grads
            dh  = dz[:sz]               # gradient for h at previous step
            dE[token_id] += dz[sz:]     # gradient for this token's embedding

        grads = dict(W=dW, b=db, Wy=dWy, by=dby, E=dE)
        return loss, grads

    # ── Parameter update ─────────────────────────────────────────────────

    def apply_grads(self, grads: dict, lr: float, clip: float = GRAD_CLIP):
        """SGD step with gradient clipping."""
        self.W  -= lr * np.clip(grads["W"],  -clip, clip)
        self.b  -= lr * np.clip(grads["b"],  -clip, clip)
        self.Wy -= lr * np.clip(grads["Wy"], -clip, clip)
        self.by -= lr * np.clip(grads["by"], -clip, clip)
        self.E  -= lr * np.clip(grads["E"],  -clip, clip)

    # ── Helpers ───────────────────────────────────────────────────────────

    @staticmethod
    def _sigmoid(x: np.ndarray) -> np.ndarray:
        return 1.0 / (1.0 + np.exp(-np.clip(x, -30, 30)))

    @staticmethod
    def _softmax(x: np.ndarray) -> np.ndarray:
        e = np.exp(x - x.max())
        return e / e.sum()


# ---------------------------------------------------------------------------
# Vocabulary + tokenisation helpers
# ---------------------------------------------------------------------------

def _build_vocab(texts: list[str]) -> dict:
    """Build word-to-index map using CountVectorizer (handles tokenisation)."""
    cv = CountVectorizer(max_features=VOCAB_SIZE - 1, token_pattern=r"(?u)\b\w+\b")
    cv.fit(texts)
    # Reserve index 0 for padding / unknown
    return {word: idx + 1 for word, idx in cv.vocabulary_.items()}


def _text_to_ids(text: str, vocab: dict, maxlen: int = MAXLEN) -> np.ndarray:
    """Convert a raw RCA string to a fixed-length integer token array."""
    tokens = text.lower().split()
    ids    = [vocab.get(t, 0) for t in tokens]   # 0 = unknown / padding
    ids    = ids[:maxlen]
    ids   += [0] * (maxlen - len(ids))
    return np.array(ids, dtype=np.int32)


# ---------------------------------------------------------------------------
# Persisted model state
# ---------------------------------------------------------------------------

class RCAModelState:
    """Everything that must survive a process restart."""

    def __init__(self):
        self.vocab:          Optional[dict]           = None   # word -> int
        self.cat_encoder:    Optional[LabelEncoder]   = None   # category labels
        self.sub_encoder:    Optional[LabelEncoder]   = None   # subCategory labels
        self.cat_model:      Optional[LSTMClassifier] = None   # category LSTM
        self.sub_model:      Optional[LSTMClassifier] = None   # subCategory LSTM
        self._training_data: list[dict]               = []     # raw records

    def save(self, path: str = MODEL_PATH) -> None:
        with open(path, "wb") as f:
            pickle.dump(self, f)

    @staticmethod
    def load(path: str = MODEL_PATH) -> "RCAModelState":
        if os.path.exists(path):
            with open(path, "rb") as f:
                return pickle.load(f)
        return RCAModelState()


_state: Optional[RCAModelState] = None


def _get_state() -> RCAModelState:
    global _state
    if _state is None:
        _state = RCAModelState.load()
    return _state


# ---------------------------------------------------------------------------
# ChromaDB collection  (stores LSTM hidden states for similarity search)
# ---------------------------------------------------------------------------

_collection: Optional[chromadb.Collection] = None


class _IdentityEmbedder(EmbeddingFunction):
    """Pass pre-computed vectors straight through to ChromaDB."""
    _dim: int = HIDDEN_SIZE

    def __init__(self):
        pass

    def __call__(self, input: Documents) -> Embeddings:
        # ChromaDB calls this on query text – return a zero vector as placeholder;
        # actual query embeddings are provided directly via query_embeddings=.
        return [np.zeros(self._dim).tolist() for _ in input]


def _get_collection() -> chromadb.Collection:
    global _collection
    if _collection is None:
        client = chromadb.PersistentClient(path=DB_PATH)

        # Guard against dimension mismatch when migrating from a previous
        # version (e.g. TF-IDF dim=8000 -> LSTM dim=64). ChromaDB hard-locks
        # the embedding dimension at collection creation time, so we must drop
        # and recreate if the stored dimension no longer matches HIDDEN_SIZE.
        existing_names = [c.name for c in client.list_collections()]
        if COLLECTION_NAME in existing_names:
            # Get without an EF to avoid EF-conflict errors from ChromaDB
            col = client.get_collection(name=COLLECTION_NAME)
            sample = col.get(limit=1, include=["embeddings"])
            embs = sample["embeddings"]
            stored_dim = (
                len(embs[0])
                if embs is not None and len(embs) > 0
                else HIDDEN_SIZE  # empty collection - assume OK
            )
            if stored_dim != HIDDEN_SIZE:
                print(
                    f"[chroma] Dimension mismatch: stored={stored_dim}, "
                    f"LSTM expects={HIDDEN_SIZE}. "
                    f"Dropping stale collection and recreating."
                )
                client.delete_collection(COLLECTION_NAME)

        _collection = client.get_or_create_collection(
            name=COLLECTION_NAME,
            embedding_function=_IdentityEmbedder(),
            metadata={"hnsw:space": "cosine"},
        )
    return _collection


# ---------------------------------------------------------------------------
# Training
# ---------------------------------------------------------------------------

def fit(
    epochs: int = EPOCHS,
    lr:     float = LR,
    verbose: bool = True,
) -> None:
    """
    (Re-)train both LSTM models (category and subCategory) on all stored RCAs.

    Call this after `add_rca` / `add_rca_batch` to update the models.
    Training runs in seconds for typical IT support corpora (<1000 docs).

    Parameters
    ----------
    epochs  : Number of full passes over the training data.
    lr      : SGD learning rate.
    verbose : Print loss every 25 epochs.
    """
    state   = _get_state()
    records = state._training_data

    if len(records) < 2:
        print("[fit] Need at least 2 RCA documents to train.")
        return

    texts       = [r["content"]     for r in records]
    cat_labels  = [r["category"]    for r in records]
    sub_labels  = [r["subCategory"] for r in records]

    # ── Build / refresh vocabulary ────────────────────────────────────────
    state.vocab = _build_vocab(texts)

    # ── Encode labels ─────────────────────────────────────────────────────
    state.cat_encoder = LabelEncoder().fit(cat_labels)
    state.sub_encoder = LabelEncoder().fit(sub_labels)

    y_cat = state.cat_encoder.transform(cat_labels)
    y_sub = state.sub_encoder.transform(sub_labels)

    n_cat = len(state.cat_encoder.classes_)
    n_sub = len(state.sub_encoder.classes_)

    # ── Initialise models (fresh each fit so vocab changes are absorbed) ──
    np.random.seed(0)
    state.cat_model = LSTMClassifier(VOCAB_SIZE, EMBED_DIM, HIDDEN_SIZE, n_cat)
    state.sub_model = LSTMClassifier(VOCAB_SIZE, EMBED_DIM, HIDDEN_SIZE, n_sub)

    token_seqs = [_text_to_ids(t, state.vocab) for t in texts]

    if verbose:
        print(f"[fit] Training on {len(records)} docs | "
              f"{n_cat} categories | {n_sub} subCategories | "
              f"{epochs} epochs")

    for epoch in range(1, epochs + 1):
        total_loss = 0.0
        # Shuffle each epoch
        idx = np.random.permutation(len(records))
        for j in idx:
            ids = token_seqs[j]

            loss_c, grads_c = state.cat_model.backward(ids, y_cat[j])
            state.cat_model.apply_grads(grads_c, lr)

            loss_s, grads_s = state.sub_model.backward(ids, y_sub[j])
            state.sub_model.apply_grads(grads_s, lr)

            total_loss += (loss_c + loss_s) / 2

        if verbose and (epoch % 25 == 0 or epoch == 1):
            print(f"  epoch {epoch:4d}/{epochs}  avg_loss={total_loss/len(records):.4f}")

    # ── Re-index ChromaDB with updated LSTM embeddings ────────────────────
    _reindex_chromadb(state, token_seqs, records)

    state.save()
    if verbose:
        print("[fit] Done. Models saved.")


def _reindex_chromadb(
    state:      RCAModelState,
    token_seqs: list[np.ndarray],
    records:    list[dict],
) -> None:
    """Re-populate ChromaDB with the LSTM hidden states after training."""
    col = _get_collection()

    # Delete all existing vectors and re-insert
    existing = col.get()
    if existing["ids"]:
        col.delete(ids=existing["ids"])

    ids       = [r["id"]          for r in records]
    docs      = [r["content"]     for r in records]
    metadatas = [{"category": r["category"], "subCategory": r["subCategory"]}
                 for r in records]
    # Use category model's hidden states as document embeddings
    embeddings = []
    for ids_seq in token_seqs:
        _, h, _ = state.cat_model.forward(ids_seq)
        embeddings.append(h.tolist())

    col.upsert(
        ids=ids,
        documents=docs,
        metadatas=metadatas,
        embeddings=embeddings,
    )


# ---------------------------------------------------------------------------
# Insert
# ---------------------------------------------------------------------------

def add_rca(
    doc_id:       str,
    content:      str,
    category:     str,
    sub_category: str,
) -> None:
    """
    Add a single RCA document to the store.

    Call `fit()` after adding documents to update the LSTM models.

    Parameters
    ----------
    doc_id       : Unique identifier, e.g. "INC-2024-001"
    content      : Full RCA text (timeline, root cause, fix, …)
    category     : e.g. "Database", "Network", "Application"
    sub_category : e.g. "Replication Lag", "BGP Misconfiguration"
    """
    state = _get_state()
    record = {
        "id":          doc_id,
        "content":     content,
        "category":    category,
        "subCategory": sub_category,
    }
    # Upsert: replace if id already exists
    existing_ids = [r["id"] for r in state._training_data]
    if doc_id in existing_ids:
        state._training_data = [r for r in state._training_data if r["id"] != doc_id]
    state._training_data.append(record)
    state.save()
    print(f"[add_rca] Queued '{doc_id}'  ->  {category} / {sub_category}")
    print("          Call fit() to retrain the models on the updated corpus.")


def add_rca_batch(records: list[dict], auto_fit: bool = True) -> None:
    """
    Bulk-add RCA documents and optionally retrain immediately.

    Each dict must have keys:  id, content, category, subCategory

    Parameters
    ----------
    records  : List of RCA dicts.
    auto_fit : If True (default), call fit() automatically after inserting.
    """
    state = _get_state()
    existing_ids = {r["id"] for r in state._training_data}
    for r in records:
        if r["id"] in existing_ids:
            state._training_data = [x for x in state._training_data
                                    if x["id"] != r["id"]]
        state._training_data.append(r)

    state.save()
    print(f"[add_rca_batch] Queued {len(records)} documents.")

    if auto_fit:
        fit()


# ---------------------------------------------------------------------------
# Inference
# ---------------------------------------------------------------------------

def predict_category(new_rca: str) -> dict:
    """
    Predict category and subCategory for a new RCA using the LSTM models.

    Returns
    -------
    {
        "predicted_category":    "Database",
        "predicted_subCategory": "Replication Lag",
        "category_probs":        {"Database": 0.91, "Network": 0.05, ...},
        "subCategory_probs":     {"Replication Lag": 0.83, ...},
        "confidence_category":   0.91,
        "confidence_subCategory": 0.83,
    }
    """
    state = _get_state()

    if state.cat_model is None or state.vocab is None:
        return {"error": "Model not trained yet. Call fit() first."}

    ids = _text_to_ids(new_rca, state.vocab)

    cat_probs, _, _ = state.cat_model.forward(ids)
    sub_probs, _, _ = state.sub_model.forward(ids)

    pred_cat = state.cat_encoder.classes_[np.argmax(cat_probs)]
    pred_sub = state.sub_encoder.classes_[np.argmax(sub_probs)]

    cat_prob_map = {
        cls: round(float(p), 4)
        for cls, p in zip(state.cat_encoder.classes_, cat_probs)
    }
    sub_prob_map = {
        cls: round(float(p), 4)
        for cls, p in zip(state.sub_encoder.classes_, sub_probs)
    }

    return {
        "predicted_category":     pred_cat,
        "predicted_subCategory":  pred_sub,
        "confidence_category":    round(float(cat_probs.max()), 4),
        "confidence_subCategory": round(float(sub_probs.max()), 4),
        "category_probs":         cat_prob_map,
        "subCategory_probs":      sub_prob_map,
    }


def find_similar_rcas(new_rca: str, top_k: int = 5) -> list[dict]:
    """
    Find the top_k most similar past RCAs using LSTM hidden-state embeddings.

    Returns a list of dicts sorted by descending similarity:
        [
            {
                "id":          "INC-003",
                "content":     "...",
                "category":    "Application",
                "subCategory": "Memory Leak",
                "similarity":  0.91,
            },
            ...
        ]

    Parameters
    ----------
    new_rca : Free-text RCA description.
    top_k   : Number of results (capped at corpus size).
    """
    state = _get_state()

    if state.cat_model is None or state.vocab is None:
        print("[find_similar_rcas] Model not trained yet. Call fit() first.")
        return []

    col    = _get_collection()
    n_docs = col.count()
    if n_docs == 0:
        print("[find_similar_rcas] No documents indexed. Call add_rca_batch + fit().")
        return []

    ids      = _text_to_ids(new_rca, state.vocab)
    _, h, _  = state.cat_model.forward(ids)
    query_vec = h.tolist()

    k       = min(top_k, n_docs)
    results = col.query(
        query_embeddings=[query_vec],
        n_results=k,
        include=["documents", "metadatas", "distances"],
    )

    hits = []
    for i in range(len(results["ids"][0])):
        distance   = results["distances"][0][i]        # cosine distance [0, 2]
        similarity = round(1.0 - distance / 2.0, 4)
        hits.append({
            "id":          results["ids"][0][i],
            "content":     results["documents"][0][i],
            "category":    results["metadatas"][0][i]["category"],
            "subCategory": results["metadatas"][0][i]["subCategory"],
            "similarity":  similarity,
        })

    return hits  # sorted by descending similarity


# ---------------------------------------------------------------------------
# Utilities
# ---------------------------------------------------------------------------

def list_all_rcas() -> list[dict]:
    """Return every stored RCA."""
    return list(_get_state()._training_data)


def delete_rca(doc_id: str) -> None:
    """Remove an RCA by ID (call fit() afterwards to retrain)."""
    state = _get_state()
    state._training_data = [r for r in state._training_data if r["id"] != doc_id]
    state.save()
    try:
        _get_collection().delete(ids=[doc_id])
    except Exception:
        pass
    print(f"[delete_rca] Deleted '{doc_id}'. Call fit() to retrain.")


def model_stats() -> dict:
    """Summary of the current model and corpus."""
    state  = _get_state()
    trained = state.cat_model is not None
    return {
        "total_docs":       len(state._training_data),
        "model_trained":    trained,
        "vocab_size":       len(state.vocab) if state.vocab else 0,
        "categories":       list(state.cat_encoder.classes_) if trained else [],
        "subCategories":    list(state.sub_encoder.classes_) if trained else [],
        "hidden_size":      HIDDEN_SIZE,
        "embed_dim":        EMBED_DIM,
        "maxlen":           MAXLEN,
        "model_path":       MODEL_PATH,
        "db_path":          DB_PATH,
        "requires_network": False,
    }


# ---------------------------------------------------------------------------
# Demo  (python rca_store.py)
# ---------------------------------------------------------------------------

if __name__ == "__main__":
    np.random.seed(42)

    sample_rcas = [
        {
            "id": "INC-001",
            "content": (
                "Production database became unreachable for 45 minutes. "
                "Routine index rebuild job consumed all available I/O bandwidth "
                "causing connection timeouts across all application servers. "
                "Fixed by scheduling rebuild during off-peak hours with I/O throttling."
            ),
            "category": "Database",
            "subCategory": "Performance Degradation",
        },
        {
            "id": "INC-002",
            "content": (
                "All users unable to authenticate for 20 minutes. "
                "LDAP server TLS certificate expired causing silent auth failures. "
                "Fixed by renewing certificate and adding expiry monitoring alert."
            ),
            "category": "Authentication",
            "subCategory": "Certificate Expiry",
        },
        {
            "id": "INC-003",
            "content": (
                "API gateway returned 502 errors for 30 minutes. "
                "Memory leak in order-service caused pods to OOMKill faster "
                "than Kubernetes could reschedule replacements. "
                "Fixed by patching memory leak and setting resource limit alerts."
            ),
            "category": "Application",
            "subCategory": "Memory Leak",
        },
        {
            "id": "INC-004",
            "content": (
                "Intermittent packet loss between data centre zones for 1 hour. "
                "Misconfigured BGP route advertisement caused traffic loop "
                "between two core routers saturating the uplinks. "
                "Fixed by correcting BGP policy and enabling route-change alerting."
            ),
            "category": "Network",
            "subCategory": "BGP Misconfiguration",
        },
        {
            "id": "INC-005",
            "content": (
                "Nightly ETL pipeline failed silently, no data loaded to warehouse. "
                "Schema change in source database was not propagated to pipeline mapping. "
                "Fixed by updating column mapping and adding schema drift detection."
            ),
            "category": "Database",
            "subCategory": "Schema Drift",
        },
        {
            "id": "INC-006",
            "content": (
                "Storage cluster entered read-only mode for 15 minutes. "
                "Disk usage reached 95 percent threshold triggering protective lock. "
                "Fixed by archiving old log files to cold storage and setting 80 percent alert."
            ),
            "category": "Infrastructure",
            "subCategory": "Disk Space Exhaustion",
        },
        {
            "id": "INC-007",
            "content": (
                "Database replica fell 10 minutes behind primary. "
                "Large bulk delete on primary generated massive binary log events "
                "that overwhelmed replica apply thread and caused severe lag. "
                "Fixed by batching bulk operations into smaller transactions."
            ),
            "category": "Database",
            "subCategory": "Replication Lag",
        },
        {
            "id": "INC-008",
            "content": (
                "External customers experienced SSL handshake failures for 2 hours. "
                "Load balancer TLS certificate expired after auto-renewal cron job "
                "failed silently due to permission error. "
                "Fixed by repairing cron permissions and adding certificate expiry alerting."
            ),
            "category": "Authentication",
            "subCategory": "Certificate Expiry",
        },
        {
            "id": "INC-009",
            "content": (
                "Application servers ran out of memory causing OOM kills. "
                "Unconstrained session cache grew unbounded over 48 hours "
                "until kernel started killing processes to reclaim memory. "
                "Fixed by adding cache eviction policy and memory usage alerting."
            ),
            "category": "Application",
            "subCategory": "Memory Leak",
        },
        {
            "id": "INC-010",
            "content": (
                "DNS resolution failures caused service discovery outage for 25 minutes. "
                "Misconfigured firewall rule blocked UDP port 53 to internal resolvers "
                "after a routine firewall policy update. "
                "Fixed by restoring DNS rule and adding DNS resolution smoke test."
            ),
            "category": "Network",
            "subCategory": "DNS Failure",
        },
    ]

    print("=" * 60)
    print("  RCA LSTM Store — Demo")
    print("=" * 60)

    # ── Seed + train ───────────────────────────────────────────────────────
    add_rca_batch(sample_rcas, auto_fit=True)

    # ── Model summary ──────────────────────────────────────────────────────
    print("\nModel stats:")
    for k, v in model_stats().items():
        print(f"  {k:25s}: {v}")

    # ── Predict a brand-new RCA ────────────────────────────────────────────
    new_rca = (
        "Incident: Postgres database killed by kernel OOM at 02:17 UTC. "
        "Impact: Order processing down for 40 minutes. "
        "Root cause: Unbounded query result set from new reporting job "
        "exhausted all available RAM on the database host. "
        "Fix: Added work_mem limit and query timeout to reporting role."
    )

    print("\n" + "─" * 60)
    print("New RCA:")
    print(f"  {new_rca[:100]}…")

    print("\nLSTM prediction:")
    pred = predict_category(new_rca)
    print(f"  Category    : {pred['predicted_category']} "
          f"(confidence {pred['confidence_category']*100:.1f}%)")
    print(f"  SubCategory : {pred['predicted_subCategory']} "
          f"(confidence {pred['confidence_subCategory']*100:.1f}%)")
    print(f"  All category probs: {pred['category_probs']}")

    print("\nTop-5 similar RCAs (by LSTM embedding):")
    for m in find_similar_rcas(new_rca, top_k=5):
        print(f"  [{m['similarity']:.3f}]  {m['id']}  "
              f"->  {m['category']} / {m['subCategory']}")