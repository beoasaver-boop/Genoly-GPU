from setuptools import setup, find_packages

with open("README.md", "r", encoding="utf-8") as fh:
    long_description = fh.read()

setup(
    name="genoly-gpu",
    version="0.2.0",
    author="Genoly-GPU",
    author_email="sebasdeasturias@gmail.com",
    description="Software de aceleracion por GPU (NVIDIA/CUDA) para el analisis de grandes datos del genoma",
    long_description=long_description,
    long_description_content_type="text/markdown",
    url="https://github.com/beoasaver-boop/Genoly-GPU",
    packages=find_packages(exclude=["examples", "tests"]),
    classifiers=[
        "Development Status :: 3 - Alpha",
        "Intended Audience :: Science/Research",
        "Topic :: Scientific/Engineering :: Bio-Informatics",
        "License :: OSI Approved :: MIT License",
        "Programming Language :: Python :: 3",
        "Programming Language :: Python :: 3.8",
        "Programming Language :: Python :: 3.9",
        "Programming Language :: Python :: 3.10",
        "Programming Language :: Python :: 3.11",
        "Programming Language :: Python :: 3.12",
    ],
    python_requires=">=3.8",
    install_requires=[
        "torch>=2.0.0",
        "numpy>=1.20.0",
    ],
)