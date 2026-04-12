"""
Train or retrain the JulyAI model.

Usage:
    python train.py                                    # Train on MNIST (default)
    python train.py --dataset cifar10 --epochs 20      # Train on CIFAR-10
    python train.py --data-dir ./my_data --epochs 50   # Train on custom image folder
    python train.py --resume weights/model_v1.pt       # Resume training from checkpoint
    python train.py --csv data.csv --label-col target   # Train on CSV data
"""

import argparse
import json
import os
import sys
import time
from pathlib import Path

import numpy as np
import torch
import torch.nn as nn
import torch.optim as optim
from torch.utils.data import DataLoader, TensorDataset, random_split

from model import Model, get_model, count_parameters
from data_loader import (
    load_builtin_dataset,
    load_image_folder,
    load_csv_dataset,
    BUILTIN_DATASETS,
)

INPUT_SHAPE = [1, 28, 28]
NUM_CLASSES = 10


def train(
    model: nn.Module,
    train_loader: DataLoader,
    val_loader: DataLoader,
    epochs: int = 10,
    lr: float = 0.001,
    optimizer_name: str = "adam",
    device: str = "cpu",
    save_dir: str = "weights",
    save_name: str = "model",
) -> dict:
    """Train the model and return metrics history."""

    # Setup optimizer
    if optimizer_name == "adam":
        optimizer = optim.Adam(model.parameters(), lr=lr)
    elif optimizer_name == "adamw":
        optimizer = optim.AdamW(model.parameters(), lr=lr)
    elif optimizer_name == "sgd":
        optimizer = optim.SGD(model.parameters(), lr=lr, momentum=0.9)
    else:
        optimizer = optim.Adam(model.parameters(), lr=lr)

    criterion = nn.CrossEntropyLoss()
    os.makedirs(save_dir, exist_ok=True)

    history = []
    best_val_acc = 0.0

    print(f"\nStarting training")
    print(f"   Device:     {device}")
    print(f"   Epochs:     {epochs}")
    print(f"   LR:         {lr}")
    print(f"   Optimizer:  {optimizer_name}")
    print(f"   Parameters: {count_parameters(model):,}")
    print(f"   Train size: {len(train_loader.dataset)}")
    print(f"   Val size:   {len(val_loader.dataset)}")
    print()

    for epoch in range(1, epochs + 1):
        start_time = time.time()

        # Train
        model.train()
        train_loss = 0.0
        train_correct = 0
        train_total = 0

        for batch_idx, (inputs, targets) in enumerate(train_loader):
            inputs, targets = inputs.to(device), targets.to(device)
            optimizer.zero_grad()
            outputs = model(inputs)
            loss = criterion(outputs, targets)
            loss.backward()
            optimizer.step()

            train_loss += loss.item() * inputs.size(0)
            _, predicted = outputs.max(1)
            train_total += targets.size(0)
            train_correct += predicted.eq(targets).sum().item()

        # Validate
        model.eval()
        val_loss = 0.0
        val_correct = 0
        val_total = 0

        with torch.no_grad():
            for inputs, targets in val_loader:
                inputs, targets = inputs.to(device), targets.to(device)
                outputs = model(inputs)
                loss = criterion(outputs, targets)

                val_loss += loss.item() * inputs.size(0)
                _, predicted = outputs.max(1)
                val_total += targets.size(0)
                val_correct += predicted.eq(targets).sum().item()

        elapsed = time.time() - start_time
        train_loss /= train_total
        train_acc = train_correct / train_total
        val_loss /= val_total
        val_acc = val_correct / val_total

        epoch_data = {
            "epoch": epoch,
            "train_loss": round(train_loss, 4),
            "train_acc": round(train_acc, 4),
            "val_loss": round(val_loss, 4),
            "val_acc": round(val_acc, 4),
            "elapsed_sec": round(elapsed, 2),
        }
        history.append(epoch_data)

        # Save best model
        if val_acc > best_val_acc:
            best_val_acc = val_acc
            best_path = os.path.join(save_dir, f"{save_name}_best.pt")
            torch.save(model.state_dict(), best_path)

        print(
            f"  Epoch {epoch:>3d}/{epochs} | "
            f"Train Loss: {train_loss:.4f} | Train Acc: {train_acc*100:.1f}% | "
            f"Val Loss: {val_loss:.4f} | Val Acc: {val_acc*100:.1f}% | "
            f"{elapsed:.1f}s"
        )

    # Save final model
    final_path = os.path.join(save_dir, f"{save_name}_final.pt")
    torch.save(model.state_dict(), final_path)
    print(f"\nTraining complete!")
    print(f"   Best validation accuracy: {best_val_acc*100:.1f}%")
    print(f"   Final model saved to: {final_path}")
    print(f"   Best model saved to:  {os.path.join(save_dir, f'{save_name}_best.pt')}")

    # Save training history
    with open("training_history.json", "w") as f:
        json.dump(history, f, indent=2)
    print(f"   History saved to: training_history.json")

    return {"history": history, "best_val_acc": best_val_acc}


def main():
    parser = argparse.ArgumentParser(description="Train or retrain JulyAI model")
    parser.add_argument("--dataset", type=str, default=None, help=f"Built-in dataset: {', '.join(BUILTIN_DATASETS.keys())}")
    parser.add_argument("--data-dir", type=str, default=None, help="Path to custom image folder (subfolders = classes)")
    parser.add_argument("--csv", type=str, default=None, help="Path to CSV file for training")
    parser.add_argument("--label-col", type=str, default=None, help="Label column name for CSV (default: last column)")
    parser.add_argument("--epochs", type=int, default=10, help="Number of epochs (default: 10)")
    parser.add_argument("--batch-size", type=int, default=64, help="Batch size (default: 64)")
    parser.add_argument("--lr", type=float, default=0.001, help="Learning rate (default: 0.001)")
    parser.add_argument("--optimizer", type=str, default="adam", choices=["adam", "adamw", "sgd"], help="Optimizer")
    parser.add_argument("--split", type=float, default=0.8, help="Train/val split ratio (default: 0.8)")
    parser.add_argument("--resume", type=str, default=None, help="Resume from weights file (retraining)")
    parser.add_argument("--device", type=str, default="auto", help="Device: cpu, cuda, mps, or auto")
    parser.add_argument("--save-name", type=str, default="model", help="Name prefix for saved weights")
    args = parser.parse_args()

    # Auto device selection
    if args.device == "auto":
        if torch.cuda.is_available():
            device = "cuda"
        elif hasattr(torch.backends, "mps") and torch.backends.mps.is_available():
            device = "mps"
        else:
            device = "cpu"
    else:
        device = args.device

    # Load or create model
    if args.resume:
        print(f"Resuming training from: {args.resume}")
        model = get_model(args.resume, device=device)
        model.train()
    else:
        model = Model().to(device)

    # Load dataset
    if args.csv:
        print(f"Loading CSV dataset: {args.csv}")
        train_data, val_data = load_csv_dataset(
            args.csv, args.label_col, args.split, INPUT_SHAPE
        )
    elif args.data_dir:
        print(f"Loading image folder: {args.data_dir}")
        train_data, val_data = load_image_folder(
            args.data_dir, INPUT_SHAPE, args.split
        )
    elif args.dataset:
        print(f"Loading built-in dataset: {args.dataset}")
        train_data, val_data = load_builtin_dataset(
            args.dataset, INPUT_SHAPE, args.split
        )
    else:
        # Auto-detect: try MNIST as default
        print("No dataset specified, using MNIST by default")
        print(f"   Available datasets: {', '.join(BUILTIN_DATASETS.keys())}")
        print(f"   Or use: --data-dir <path> or --csv <path>")
        train_data, val_data = load_builtin_dataset("mnist", INPUT_SHAPE, args.split)

    train_loader = DataLoader(train_data, batch_size=args.batch_size, shuffle=True)
    val_loader = DataLoader(val_data, batch_size=args.batch_size, shuffle=False)

    # Train
    result = train(
        model=model,
        train_loader=train_loader,
        val_loader=val_loader,
        epochs=args.epochs,
        lr=args.lr,
        optimizer_name=args.optimizer,
        device=device,
        save_name=args.save_name,
    )

    print(f"\nDone! Run predictions with:")
    print(f"   python predict.py --input your_image.png")


if __name__ == "__main__":
    main()
