"""Setup file to make backend modules installable as a package."""

from setuptools import setup, find_packages

setup(
    name="julyai-core",
    version="0.1.0",
    packages=find_packages(),
    install_requires=[
        "torch>=2.0.0",
        "torchvision>=0.15.0",
        "pydantic>=2.10.0,<3.0.0",
    ],

    python_requires=">=3.10",
)
