"""
Genoly-GPU: software de aceleración por GPU (NVIDIA/CUDA) para el
análisis de grandes datos del genoma.
"""

__version__ = "0.2.0"

from Genoly.core.device import DeviceManager, GPUInfo, get_device
from Genoly.core.gpu_setup import GpuSetup, NvidiaSystemInfo, recommend_cuda_tag
from Genoly.io.fasta import FastaRecord, FastaReader, read_fasta, write_fasta
from Genoly.io.fastq import FastqRecord, FastqReader, read_fastq, write_fastq
from Genoly.encoding.encoder import SequenceEncoder, encode_to_tensor
from Genoly.qc.quality import QualityAnalyzer, QualityReport
from Genoly.kmer.kmers import KmerCounter
from Genoly.variants.caller import VariantCaller, Variant, Read

__all__ = [
    '__version__',
    'DeviceManager',
    'GPUInfo',
    'get_device',
    'GpuSetup',
    'NvidiaSystemInfo',
    'recommend_cuda_tag',
    'FastaRecord',
    'FastaReader',
    'read_fasta',
    'write_fasta',
    'FastqRecord',
    'FastqReader',
    'read_fastq',
    'write_fastq',
    'SequenceEncoder',
    'encode_to_tensor',
    'QualityAnalyzer',
    'QualityReport',
    'KmerCounter',
    'VariantCaller',
    'Variant',
    'Read',
]