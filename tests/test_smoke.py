"""
Tests de humo para los modulos de Genoly-GPU.

Ejecutar desde la raiz del proyecto:
    python -m pytest tests -v
o directamente:
    python tests/test_smoke.py
"""

import os
import sys
import unittest

sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), '..')))

import torch

from Genoly import (
    DeviceManager,
    FastaRecord,
    FastaReader,
    write_fasta,
    FastqRecord,
    write_fastq,
    FastqReader,
    SequenceEncoder,
    QualityAnalyzer,
    KmerCounter,
    VariantCaller,
    Read,
)
from Genoly.core.gpu_setup import GpuSetup, recommend_cuda_tag


SEQ = "ACGTACGTACGTACGTACGTACGTACGTACGTACGTACGT"


class TestDevice(unittest.TestCase):
    def test_device_manager(self):
        manager = DeviceManager()
        self.assertTrue(manager.device.type in ('cuda', 'cpu'))

    def test_get_device(self):
        d = DeviceManager('cpu').device
        self.assertEqual(d.type, 'cpu')


class TestIO(unittest.TestCase):
    def setUp(self):
        self.tmpdir = os.path.join(os.path.dirname(__file__), '_tmp_io')
        os.makedirs(self.tmpdir, exist_ok=True)
        self.fasta_path = os.path.join(self.tmpdir, 'test.fasta')
        self.fastq_path = os.path.join(self.tmpdir, 'test.fastq')

    def tearDown(self):
        for p in (self.fasta_path, self.fastq_path):
            if os.path.exists(p):
                os.remove(p)
        os.rmdir(self.tmpdir)

    def test_fasta_roundtrip(self):
        records = [FastaRecord(id="seq1", sequence=SEQ, description="test")]
        write_fasta(self.fasta_path, records)
        loaded = FastaReader(self.fasta_path).read_all()
        self.assertEqual(len(loaded), 1)
        self.assertEqual(loaded[0].sequence, SEQ)
        self.assertEqual(loaded[0].id, "seq1")
        self.assertEqual(loaded[0].header, "seq1 test")

    def test_fastq_roundtrip(self):
        records = [FastqRecord(id="read1", sequence=SEQ,
                               quality="I" * len(SEQ))]
        write_fastq(self.fastq_path, records)
        loaded = FastqReader(self.fastq_path).read_all()
        self.assertEqual(len(loaded), 1)
        self.assertEqual(loaded[0].sequence, SEQ)
        self.assertEqual(loaded[0].scores, [40] * len(SEQ))


class TestEncoding(unittest.TestCase):
    def test_roundtrip(self):
        enc = SequenceEncoder('cpu')
        tensor, lengths = enc.encode([SEQ, SEQ[:10]])
        decoded = enc.decode(tensor, lengths)
        self.assertEqual(decoded, [SEQ, SEQ[:10]])

    def test_one_hot_shape(self):
        enc = SequenceEncoder('cpu')
        onehot = enc.encode_one_hot([SEQ])
        self.assertEqual(tuple(onehot.shape), (1, len(SEQ), 5))

    def test_gc_reference(self):
        enc = SequenceEncoder('cpu')
        seq = "GCGCAT"
        tensor, _ = enc.encode([seq])
        # A=0,C=1,G=2,T=3
        valid = tensor < 4
        gc = ((tensor == 1) | (tensor == 2)) & valid
        self.assertEqual(gc.sum().item(), 4)


class TestQC(unittest.TestCase):
    def test_gc_content(self):
        qa = QualityAnalyzer('cpu')
        gc = qa.gc_content(["GCGCAT"]).item()
        self.assertAlmostEqual(gc, 4 / 6, places=5)

    def test_base_composition(self):
        qa = QualityAnalyzer('cpu')
        comp = qa.base_composition(["AAATTT"])
        self.assertEqual(comp['A'], 3)
        self.assertEqual(comp['T'], 3)
        self.assertEqual(comp['G'], 0)

    def test_trim_by_quality(self):
        qa = QualityAnalyzer('cpu')
        # Secuencia larga con calidad baja en la cola
        seq = "ACGTACGT"
        qual = "IIII" + "####"  # 4 bases buenas, 4 malas
        rec = FastqRecord(id="r1", sequence=seq, quality=qual)
        trimmed = qa.trim_by_quality([rec], min_quality=20, window_size=2)
        self.assertEqual(len(trimmed[0].sequence), 4)

    def test_filter_by_quality(self):
        qa = QualityAnalyzer('cpu')
        seq = "ACGTACGTACGT" * 3
        good = FastqRecord(id="g", sequence=seq, quality="I" * len(seq))
        bad = FastqRecord(id="b", sequence=seq, quality="!" * len(seq))
        kept = qa.filter_by_quality([good, bad], min_mean_quality=20,
                                    min_length=10)
        self.assertEqual(len(kept), 1)
        self.assertEqual(kept[0].id, "g")


class TestKmer(unittest.TestCase):
    def test_count_known(self):
        kc = KmerCounter('cpu')
        # 4 copias de ACGTACGT -> k-mer ACGTACGT aparece 2 veces (ventanas)
        values, counts = kc.count(["ACGTACGTACGTACGTACGTACGTACGTACGTACGTACGT"], k=8)
        self.assertTrue(int(counts.max().item()) >= 1)
        # El k-mer más frecuente debe ser ACGTACGT
        top = kc.decode_kmer(int(values[counts.argmax()].item()), 8)
        self.assertEqual(top, "ACGTACGT")

    def test_canonical(self):
        kc = KmerCounter('cpu')
        # 'ACGTACGT' y su reverse complement son iguales
        values, counts = kc.count(["ACGTACGT"], k=8, canonical=True)
        self.assertEqual(len(values), 1)
        self.assertEqual(kc.decode_kmer(int(values[0].item()), 8), "ACGTACGT")

    def test_spectrum(self):
        kc = KmerCounter('cpu')
        spec = kc.spectrum(["ACGT" * 25], k=4)
        self.assertTrue(len(spec) > 0)


class TestGpuSetup(unittest.TestCase):
    def test_recommend_cuda_tag(self):
        self.assertEqual(recommend_cuda_tag("12.4"), "cu124")
        self.assertEqual(recommend_cuda_tag("12.6"), "cu126")
        self.assertEqual(recommend_cuda_tag("13.1"), "cu130")
        self.assertIsNone(recommend_cuda_tag(None))

    def test_install_command(self):
        cmd = GpuSetup.install_command("cu126")
        self.assertIn("--index-url https://download.pytorch.org/whl/cu126", cmd)
        self.assertIn("torch", cmd)

    def test_detect_nvidia(self):
        info = GpuSetup.detect_nvidia()
        self.assertIsInstance(info.available, bool)
        # En máquinas sin GPU debe reportar no disponible sin fallar
        if info.available:
            self.assertIsNotNone(info.driver_version)
            self.assertIsNotNone(info.cuda_version)

    def test_torch_status_consistent(self):
        status = GpuSetup.torch_status()
        self.assertIn("installed", status)
        if status["installed"]:
            import torch
            self.assertEqual(status["cuda_available"], torch.cuda.is_available())


class TestVariantCaller(unittest.TestCase):
    def test_snv_detection(self):
        ref = "ACGTACGTACGTACGTACGTACGTACGTACGTACGTACGT"
        mut_ref = list(ref)
        mut_ref[10] = 'T'  # referencia con SNV en pos 10
        mut_ref = "".join(mut_ref)

        reads = []
        for start in range(0, 20, 5):
            reads.append(Read(sequence=mut_ref[start:start + 15], start=start))
        # Duplicar cobertura
        reads = reads * 4

        vc = VariantCaller('cpu')
        variants = vc.call_variants(ref, reads, min_depth=3, min_alt_freq=0.8)
        snvs = [v for v in variants if v.type == 'SNV']
        self.assertEqual(len(snvs), 1)
        self.assertEqual(snvs[0].position, 11)  # 1-based
        self.assertEqual(snvs[0].ref, 'G')
        self.assertEqual(snvs[0].alt, 'T')


if __name__ == "__main__":
    unittest.main(verbosity=2)