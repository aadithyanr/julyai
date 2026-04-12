"""
Run inference with a trained JulyAI model.

Usage:
    python predict.py --input image.png
    python predict.py --input data.json
    python predict.py --input tensor.npy
    python predict.py --random                    # Random tensor test
    python predict.py --input image.png --model weights/model_v1.pt
"""

import argparse
import json
import sys
import os
import numpy as np
import torch
from pathlib import Path

from model import Model, get_model, count_parameters

INPUT_SHAPE = [1, 28, 28]
NUM_CLASSES = 10


def load_image(path: str) -> torch.Tensor:
    """Load and preprocess an image file to match model input shape."""
    from PIL import Image

    img = Image.open(path)

    channels = INPUT_SHAPE[0] if len(INPUT_SHAPE) == 3 else 1
    height = INPUT_SHAPE[1] if len(INPUT_SHAPE) == 3 else INPUT_SHAPE[0]
    width = INPUT_SHAPE[2] if len(INPUT_SHAPE) == 3 else INPUT_SHAPE[-1]

    # Convert to correct mode
    if channels == 1:
        img = img.convert("L")
    elif channels == 3:
        img = img.convert("RGB")
    else:
        img = img.convert("RGB")

    img = img.resize((width, height))

    # Convert to tensor and normalize to [0, 1]
    tensor = torch.tensor(np.array(img), dtype=torch.float32) / 255.0

    if channels == 1:
        tensor = tensor.unsqueeze(0)  # (H, W) -> (1, H, W)
    else:
        tensor = tensor.permute(2, 0, 1)  # (H, W, C) -> (C, H, W)

    return tensor.unsqueeze(0)  # Add batch dim -> (1, C, H, W)


def load_json(path: str) -> torch.Tensor:
    """Load a JSON tensor (2D array)."""
    with open(path) as f:
        data = json.load(f)
    if isinstance(data, dict):
        data = data.get("input", data.get("tensor", data.get("data", [])))
    return torch.tensor(data, dtype=torch.float32)


def load_numpy(path: str) -> torch.Tensor:
    """Load a numpy .npy file."""
    arr = np.load(path)
    tensor = torch.tensor(arr, dtype=torch.float32)
    if tensor.dim() == len(INPUT_SHAPE):
        tensor = tensor.unsqueeze(0)  # Add batch dim
    return tensor


def find_best_weights() -> str | None:
    """Find the best available weights file."""
    weights_dir = Path("weights")
    if not weights_dir.exists():
        return None
    pt_files = sorted(weights_dir.glob("*.pt"))
    if not pt_files:
        return None
    return str(pt_files[0])


def predict(input_tensor: torch.Tensor, model: torch.nn.Module) -> dict:
    """Run inference and return formatted results."""
    model.eval()
    with torch.no_grad():
        output = model(input_tensor)

    probabilities = torch.softmax(output, dim=1) if output.shape[-1] > 1 else output
    predicted_class = torch.argmax(probabilities, dim=1).item()
    confidence = probabilities[0, predicted_class].item()

    result = {
        "predicted_class": predicted_class,
        "confidence": round(confidence * 100, 2),
        "output_shape": list(output.shape),
        "all_probabilities": [round(p, 4) for p in probabilities[0].tolist()],
    }
    return result


def main():
    parser = argparse.ArgumentParser(description="JulyAI Model Inference")
    parser.add_argument("--input", "-i", type=str, help="Input file (image, JSON, or numpy)")
    parser.add_argument("--model", "-m", type=str, default=None, help="Path to weights file (default: auto-detect)")
    parser.add_argument("--random", "-r", action="store_true", help="Use random tensor input for testing")
    parser.add_argument("--device", "-d", type=str, default="cpu", choices=["cpu", "cuda", "mps"], help="Device")
    parser.add_argument("--top-k", "-k", type=int, default=5, help="Show top-K predictions")
    args = parser.parse_args()

    if not args.input and not args.random:
        parser.print_help()
        print("\nQuick test: python predict.py --random")
        sys.exit(0)

    # Find weights
    weights_path = args.model or find_best_weights()
    if weights_path and os.path.exists(weights_path):
        print(f"Loading model with weights: {weights_path}")
        model = get_model(weights_path, device=args.device)
    else:
        print("No trained weights found. Running with random weights.")
        print("   Train the model first: python train.py")
        model = get_model(device=args.device)

    print(f"Model parameters: {count_parameters(model):,}")
    print(f"Expected input shape: {INPUT_SHAPE}")
    print()

    # Load input
    if args.random:
        print("Using random tensor input for testing")
        input_tensor = torch.randn(1, *INPUT_SHAPE).to(args.device)
    else:
        ext = Path(args.input).suffix.lower()
        if ext in (".png", ".jpg", ".jpeg", ".bmp", ".gif", ".webp", ".tiff"):
            print(f"Loading image: {args.input}")
            input_tensor = load_image(args.input).to(args.device)
        elif ext == ".json":
            print(f"Loading JSON: {args.input}")
            input_tensor = load_json(args.input).to(args.device)
        elif ext == ".npy":
            print(f"Loading numpy: {args.input}")
            input_tensor = load_numpy(args.input).to(args.device)
        else:
            print(f"Unsupported file format: {ext}")
            print("   Supported: .png, .jpg, .json, .npy")
            sys.exit(1)

    print(f"   Input tensor shape: {list(input_tensor.shape)}")
    print()

    # Run inference
    result = predict(input_tensor, model)

    print("=" * 50)
    print("  PREDICTION RESULTS")
    print("=" * 50)
    print(f"  Predicted class: {result['predicted_class']}")
    print(f"  Confidence:      {result['confidence']}%")
    print(f"  Output shape:    {result['output_shape']}")
    print()

    # Top-K predictions
    probs = result["all_probabilities"]
    top_k = min(args.top_k, len(probs))
    sorted_indices = sorted(range(len(probs)), key=lambda i: probs[i], reverse=True)
    print(f"  Top-{top_k} predictions:")
    for rank, idx in enumerate(sorted_indices[:top_k], 1):
        bar = "█" * int(probs[idx] * 30)
        print(f"    {rank}. Class {idx:>3d}: {probs[idx]*100:>6.2f}% {bar}")
    print("=" * 50)

    # Save result
    with open("last_prediction.json", "w") as f:
        json.dump(result, f, indent=2)
    print("\nResult saved to last_prediction.json")


if __name__ == "__main__":
    main()
