"""The shared global PCA frame for atlas terms and proof-path overlays."""
import numpy as np
from sklearn.decomposition import PCA


def global_projection(vectors, display):
    model = PCA(n_components=2, svd_solver="full").fit(vectors[display])
    scale = np.maximum(np.std(model.transform(vectors[display]), axis=0), 1e-8)
    return lambda rows: .97 * np.tanh(model.transform(rows) / (1.9 * scale))
