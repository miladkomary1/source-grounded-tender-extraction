# Multi-country corpus of contract notices

`manifest.json` defines the corpus of 144 works contract notices used in the
multi-country study: twelve from each of twelve member states, published from
1 January 2025, taken from Tenders Electronic Daily, the official procurement journal
of the European Union. Eighty-seven of them carry a published contract value, which is
the reference the study measures against and which needs no annotation.

Each record carries the notice identifier, the buyer, the country, the original
language of publication, the procedure, the Common Procurement Vocabulary codes, the
publication date, the published value where there is one, and `pdfEnglish`, the
permanent address of the English rendering of that notice.

The rendered notices themselves are not stored here. They are public documents and each
one is retrievable from the address in its record; `analysis/numeric-failure/download-notices.mjs`
fetches the whole set into `data/ted/pdf/` in one pass, after which the three
measurement scripts run offline.
