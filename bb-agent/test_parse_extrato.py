"""Testes do agente de extratos do Banco do Brasil.

Usam linhas sintéticas (sem dados bancários reais), então rodam sem PDFs:

    python3 -m unittest test_parse_extrato -v
"""
import unittest

import parse_extrato as P


class TestNumberParsing(unittest.TestCase):
    def test_br_to_float(self):
        self.assertEqual(P.br_to_float("1.234.567,89"), 1234567.89)
        self.assertEqual(P.br_to_float("0,33"), 0.33)
        self.assertEqual(P.br_to_float("740.000,00"), 740000.0)

    def test_strip_accents(self):
        self.assertEqual(P.strip_accents("Consórcio"), "consorcio")
        self.assertEqual(P.strip_accents("CÂMBIO"), "cambio")


class TestOcrCleanup(unittest.TestCase):
    def test_euro_is_credit(self):
        self.assertEqual(P.clean_line("BB Rende Fácil 9.903 42,25 €"),
                         "BB Rende Fácil 9.903 42,25 C")

    def test_missing_space_before_dc(self):
        self.assertEqual(P.clean_line("Cobrança 789,79D"), "Cobrança 789,79 D")

    def test_pipe_removed(self):
        self.assertEqual(P.clean_line("0000 | 00000 798 BB Rende"),
                         "0000 00000 798 BB Rende")


class TestCategorize(unittest.TestCase):
    def test_known_categories(self):
        cases = {
            "Pix - Recebido": "Pix recebido",
            "Pix - Enviado": "Pix enviado",
            "TED": "TED/Transferência",
            "BB GIRO PRONAMPE": "Financiamento (Giro/Pronampe/PEAC)",
            "Capital Giro PEAC FGI": "Financiamento (Giro/Pronampe/PEAC)",
            "BB Consórcio - Prestação": "Consórcio",
            "Tarifa Pacote de Serviços": "Tarifas bancárias",
            "Cobrança de I.O.F.": "IOF",
            "Cobrança de 1.0.F.": "IOF",        # artefato de OCR
            "Cobrança de Juros": "Juros",
            "Estorno de Débito": "Estornos",
            "Câmbio": "Câmbio",
            "Ordem Bancária": "Ordem Bancária (recebida)",
            "Pagto cartão crédito": "Cartão de crédito",
        }
        for desc, expected in cases.items():
            self.assertEqual(P.categorize(desc)[0], expected, desc)

    def test_internal_flag(self):
        self.assertTrue(P.categorize("BB Rende Fácil")[1])
        self.assertFalse(P.categorize("Pix - Recebido")[1])


class TestLineParsing(unittest.TestCase):
    def _parse_one(self, line):
        line = P.clean_line(line)
        m = P.TX_RE.match(line)
        self.assertIsNotNone(m, line)
        rest = m.group("rest")
        vm = P.VAL_RE.search(rest)
        self.assertIsNotNone(vm, rest)
        head = rest[: vm.start()].strip()
        dm = P.DOC_RE.match(head)
        desc = dm.group("desc").strip() if dm else head
        valor = P.br_to_float(vm.group("valor"))
        signed = valor if vm.group("dc") == "C" else -valor
        return m.group("hist"), desc, signed, vm.group("dc")

    def test_single_date_format(self):  # extratos jan/fev 2024
        hist, desc, val, dc = self._parse_one(
            "03/01/2024 0000 14397 821 Pix - Recebido 5.001.407.494 10.000,00 C")
        self.assertEqual((hist, desc, dc), ("821", "Pix - Recebido", "C"))
        self.assertEqual(val, 10000.0)

    def test_double_date_format(self):  # formato com Dt. balancete + Dt. movimento
        hist, desc, val, dc = self._parse_one(
            "02/05/2024 02/05/2024 0000 13601 118 Cobrança de I.O.F. 391.100.702 0,33 D")
        self.assertEqual((hist, desc, dc), ("118", "Cobrança de I.O.F.", "D"))
        self.assertEqual(val, -0.33)

    def test_debit_with_saldo(self):
        hist, desc, val, dc = self._parse_one(
            "28/05/2024 28/05/2024 0000 00000 798 BB Rende Fácil 9.903 179,26 C 6.257,65 D")
        self.assertEqual(val, 179.26)
        self.assertEqual(P.categorize(desc)[1], True)  # interno


class TestDeduplicate(unittest.TestCase):
    def _stmt(self, arquivo, periodo):
        return P.Statement(arquivo=arquivo, periodo=periodo, conta="99243-7",
                           usou_ocr=False)

    def test_duplicate_period_and_missing_months(self):
        stmts = [
            self._stmt("AGO 24.pdf", "2024-08"),
            self._stmt("SET 24.pdf", "2024-08"),  # mês errado no nome
            self._stmt("OUT 24.pdf", "2024-08"),  # mês errado no nome
            self._stmt("NOV 24.pdf", "2024-11"),
        ]
        dq = P.deduplicate(stmts)
        canon = P.canonical(stmts)
        # 2024-08 mantém só um canônico, e prefere o de nome correto (AGO)
        ago = [s for s in canon if s.periodo == "2024-08"]
        self.assertEqual(len(ago), 1)
        self.assertEqual(ago[0].arquivo, "AGO 24.pdf")
        self.assertEqual(len(dq["duplicados"]), 2)
        # meses 09 e 10 faltando entre 08 e 11
        self.assertEqual(dq["meses_faltantes"], ["2024-09", "2024-10"])


SAMPLE_OFX = """OFXHEADER:100
<OFX><BANKMSGSRSV1><STMTTRNRS><STMTRS>
<BANKACCTFROM><ACCTID>99243-7</BANKACCTFROM>
<STMTTRN><TRNTYPE>CREDIT<DTPOSTED>20250120120000[-3:GMT]<TRNAMT>7000.00<FITID>1<MEMO>Pix - Recebido</STMTTRN>
<STMTTRN><TRNTYPE>DEBIT<DTPOSTED>20250120<TRNAMT>-35527.44<FITID>2<MEMO>BB Giro</STMTTRN>
<STMTTRN><TRNTYPE>CREDIT<DTPOSTED>20250120<TRNAMT>28527.44<FITID>3<MEMO>BB Rende Facil</STMTTRN>
<STMTTRN><TRNTYPE>DEBIT<DTPOSTED>20250210<TRNAMT>-750.96<FITID>4<MEMO>BB Consorcio - Prestacao</STMTTRN>
</STMTRS></STMTTRNRS></BANKMSGSRSV1></OFX>
"""

SAMPLE_CSV = '\n'.join([
    '"Extrato";"";"";"";""',
    '"Data";"Historico";"Numero do documento";"Valor";"Tipo Lancamento"',
    '"20/01/2025";"Pix - Recebido";"373757048962561";"7.000,00";"Credito"',
    '"20/01/2025";"BB Giro";"5228693000111";"35.527,44";"Debito"',
    '"05/02/2025";"Estorno de Debito";"999";"1.234,56";"Credito"',
])


class TestOfxImport(unittest.TestCase):
    def setUp(self):
        import tempfile
        self.tmp = tempfile.TemporaryDirectory()

    def tearDown(self):
        self.tmp.cleanup()

    def _write(self, name, content):
        from pathlib import Path
        p = Path(self.tmp.name) / name
        p.write_text(content, encoding="utf-8")
        return p

    def test_ofx_groups_by_month_and_categorizes(self):
        stmts = P.parse_ofx(self._write("e.ofx", SAMPLE_OFX))
        by = {s.periodo: s for s in stmts}
        self.assertEqual(set(by), {"2025-01", "2025-02"})
        jan = by["2025-01"]
        self.assertEqual(jan.conta, "99243-7")
        self.assertEqual(jan.creditos, 7000.0)        # Rende Facil é interno, excluído
        self.assertEqual(jan.debitos, 35527.44)
        self.assertTrue(any(t.interno for t in jan.transactions))

    def test_csv_with_debit_credit_column(self):
        stmts = P.parse_csv(self._write("e.csv", SAMPLE_CSV))
        by = {s.periodo: s for s in stmts}
        self.assertEqual(by["2025-01"].debitos, 35527.44)
        self.assertEqual(by["2025-01"].creditos, 7000.0)
        self.assertEqual(by["2025-02"].transactions[0].categoria, "Estornos")
        self.assertEqual(by["2025-02"].transactions[0].valor, 1234.56)


class TestPeriodFromName(unittest.TestCase):
    def test_period_from_name(self):
        self.assertEqual(P._period_from_name("BB janeiro 24.pdf"), "2024-01")
        self.assertEqual(P._period_from_name("DEZ 24.pdf"), "2024-12")
        self.assertEqual(P._period_from_name("AGOS 25.pdf"), "2025-08")


if __name__ == "__main__":
    unittest.main()
