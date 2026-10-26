from __future__ import annotations

import cv2
import numpy as np

from insightface.app import FaceAnalysis


# ============================================================
# FACE MODEL CONFIGURATION
# ============================================================

MODEL_NAME = "buffalo_l"

FACE_DET_SIZE = (640, 640)

MIN_FACE_SIZE = 80

MIN_DETECTION_SCORE = 0.60


# ============================================================
# GLOBAL MODEL
# ============================================================

_face_app: FaceAnalysis | None = None


# ============================================================
# LOAD MODEL
# ============================================================

def get_face_app() -> FaceAnalysis:

    global _face_app

    if _face_app is None:

        _face_app = FaceAnalysis(
            name=MODEL_NAME,
            providers=[
                "CPUExecutionProvider"
            ],
        )

        _face_app.prepare(
            ctx_id=0,
            det_size=FACE_DET_SIZE,
        )

    return _face_app


# ============================================================
# IMAGE DECODING
# ============================================================

def decode_image(
    image_bytes: bytes,
) -> np.ndarray:

    if not image_bytes:

        raise ValueError(
            "Empty image received."
        )

    image_array = np.frombuffer(
        image_bytes,
        dtype=np.uint8,
    )

    image = cv2.imdecode(
        image_array,
        cv2.IMREAD_COLOR,
    )

    if image is None:

        raise ValueError(
            "Unable to decode image."
        )

    return image


# ============================================================
# IMAGE QUALITY
# ============================================================

def calculate_image_quality(
    image: np.ndarray,
) -> float:

    gray = cv2.cvtColor(
        image,
        cv2.COLOR_BGR2GRAY,
    )

    sharpness = cv2.Laplacian(
        gray,
        cv2.CV_64F,
    ).var()

    # Normalize practical sharpness range
    quality = min(
        max(sharpness / 500.0, 0.0),
        1.0,
    )

    return round(
        quality * 100,
        2,
    )


# ============================================================
# FACE QUALITY
# ============================================================

def calculate_face_quality(
    face,
) -> float:

    detection_score = float(
        face.det_score
    )

    bbox = face.bbox.astype(int)

    width = max(
        int(bbox[2] - bbox[0]),
        0,
    )

    height = max(
        int(bbox[3] - bbox[1]),
        0,
    )

    size_score = min(
        min(width, height) / 200.0,
        1.0,
    )

    quality = (
        detection_score * 0.70
        + size_score * 0.30
    )

    return round(
        quality * 100,
        2,
    )


# ============================================================
# EXTRACT SINGLE FACE
# ============================================================

def extract_single_face(
    image_bytes: bytes,
):

    image = decode_image(
        image_bytes
    )

    image_quality = calculate_image_quality(
        image
    )

    face_app = get_face_app()

    faces = face_app.get(
        image
    )

    if not faces:

        raise ValueError(
            "No face detected. "
            "Please make sure the face is clearly visible."
        )

    if len(faces) > 1:

        raise ValueError(
            "Multiple faces detected. "
            "Only one person's face should be visible."
        )

    face = faces[0]

    detection_score = float(
        face.det_score
    )

    if detection_score < MIN_DETECTION_SCORE:

        raise ValueError(
            "Face detection confidence is too low. "
            "Please improve lighting and face position."
        )

    bbox = face.bbox.astype(int)

    face_width = int(
        bbox[2] - bbox[0]
    )

    face_height = int(
        bbox[3] - bbox[1]
    )

    if (
        face_width < MIN_FACE_SIZE
        or face_height < MIN_FACE_SIZE
    ):

        raise ValueError(
            "Face is too small. "
            "Move closer to the camera."
        )

    embedding = face.embedding

    if embedding is None:

        raise ValueError(
            "Unable to generate face embedding."
        )

    embedding = np.asarray(
        embedding,
        dtype=np.float32,
    )

    norm = np.linalg.norm(
        embedding
    )

    if norm == 0:

        raise ValueError(
            "Invalid face embedding generated."
        )

    embedding = (
        embedding / norm
    )

    face_quality = calculate_face_quality(
        face
    )

    return {
        "embedding": embedding.tolist(),

        "detection_score": round(
            detection_score,
            6,
        ),

        "face_quality": face_quality,

        "image_quality": image_quality,

        "bbox": [
            int(bbox[0]),
            int(bbox[1]),
            int(bbox[2]),
            int(bbox[3]),
        ],
    }


# ============================================================
# EMBEDDING SIMILARITY
# ============================================================

def cosine_similarity(
    embedding_a: list[float],
    embedding_b: list[float],
) -> float:

    a = np.asarray(
        embedding_a,
        dtype=np.float32,
    )

    b = np.asarray(
        embedding_b,
        dtype=np.float32,
    )

    a_norm = np.linalg.norm(a)

    b_norm = np.linalg.norm(b)

    if a_norm == 0 or b_norm == 0:

        return 0.0

    similarity = float(
        np.dot(a, b)
        / (a_norm * b_norm)
    )

    return max(
        min(similarity, 1.0),
        -1.0,
    )

# ============================================================
# FACE MATCHING
# ============================================================

RECOGNITION_THRESHOLD = 0.45


def find_best_match(
    query_embedding: list[float],
    face_profiles: list,
):
    """
    Find the best employee match from the face profiles.

    Only profiles supplied by the caller are searched.
    The router will make sure these profiles belong to
    the authenticated user's company.
    """

    if not query_embedding:
        return None

    if not face_profiles:
        return None

    best_profile = None
    best_similarity = -1.0

    for profile in face_profiles:

        try:

            similarity = cosine_similarity(
                query_embedding,
                profile.embedding,
            )

        except Exception as error:

            print(
                "FACE COMPARISON ERROR:",
                error,
            )

            continue

        if similarity > best_similarity:

            best_similarity = similarity
            best_profile = profile

    if best_profile is None:
        return None

    if best_similarity < RECOGNITION_THRESHOLD:

        return None

    return {
        "profile": best_profile,
        "similarity": round(
            best_similarity,
            6,
        ),
        "confidence": round(
            best_similarity * 100,
            2,
        ),
    }


# ============================================================
# RECOGNIZE FACE FROM IMAGE
# ============================================================

def recognize_face(
    image_bytes: bytes,
    face_profiles: list,
):
    """
    Detect exactly one face and compare it against
    the supplied company face profiles.
    """

    face_data = extract_single_face(
        image_bytes
    )

    match = find_best_match(
        face_data["embedding"],
        face_profiles,
    )

    return {
        "face_data": face_data,
        "match": match,
    }