package com.codemapper.service;

import com.codemapper.model.dto.DiagnosticsExportRequest;
import com.codemapper.model.dto.UnresolvedReference;
import com.lowagie.text.Chunk;
import com.lowagie.text.Document;
import com.lowagie.text.Element;
import com.lowagie.text.FontFactory;
import com.lowagie.text.PageSize;
import com.lowagie.text.Paragraph;
import com.lowagie.text.Phrase;
import com.lowagie.text.Rectangle;
import com.lowagie.text.pdf.PdfPCell;
import com.lowagie.text.pdf.PdfPTable;
import com.lowagie.text.pdf.PdfWriter;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;

import java.awt.Color;
import java.io.ByteArrayOutputStream;
import java.time.ZoneId;
import java.time.ZonedDateTime;
import java.time.format.DateTimeFormatter;
import java.util.ArrayList;
import java.util.List;

/**
 * Renders the contents of the DiagnosticsPanel as a printable PDF report.
 * Three sections, one per kind: UNRESOLVED, FALSE_NEGATIVE, UNPARSEABLE.
 * Each finding shows file path, line, snippet and reason — the same data
 * the dev sees in the panel, but in a format they can keep, share or attach
 * to a ticket.
 *
 * <p>FREE plan: only the first {@link #FREE_DIAGNOSTICS_LIMIT} items are
 * detailed (priority order: UNRESOLVED → FALSE_NEGATIVE → UNPARSEABLE),
 * followed by a locked "N more in PRO" section. The header totals stay
 * honest in both plans — what's capped is the detail, never the count.
 */
@Slf4j
@Service
public class DiagnosticsPdfService {

    private static final Color BORDO = new Color(185, 28, 66);
    private static final Color BODY = new Color(20, 20, 20);
    private static final Color MUTED = new Color(110, 110, 115);
    private static final Color HAIRLINE = new Color(200, 200, 205);
    private static final Color WARN = new Color(217, 119, 6);
    private static final Color ERROR = new Color(220, 38, 38);

    private static final DateTimeFormatter HUMAN_TS = DateTimeFormatter
            .ofPattern("yyyy-MM-dd HH:mm:ss z");

    /** Cap del PDF FREE — los primeros N diagnósticos se muestran detallados,
     *  el resto se reporta como contador en una sección PRO bloqueada.
     *  Constante separada del cap del grafo (focusMaxConnections) a propósito:
     *  ambos podrían moverse independientemente sin acoplarse. */
    private static final int FREE_DIAGNOSTICS_LIMIT = 10;

    public byte[] generatePdf(DiagnosticsExportRequest req) {
        Document doc = new Document(PageSize.A4, 42, 42, 50, 50);
        ByteArrayOutputStream out = new ByteArrayOutputStream();
        PdfWriter.getInstance(doc, out);

        try {
            doc.open();

            // ── Group findings by kind FIRST so we can compute real totals
            //    before any capping. The header + footer use the real totals
            //    regardless of plan — only the detail rendering gets capped. ──
            List<UnresolvedReference> all =
                    req.getDiagnostics() == null ? List.of() : req.getDiagnostics();
            List<UnresolvedReference> unresolved = new ArrayList<>();
            List<UnresolvedReference> falseNeg = new ArrayList<>();
            List<UnresolvedReference> unparseable = new ArrayList<>();
            for (UnresolvedReference d : all) {
                if (d == null || d.getKind() == null) continue;
                switch (d.getKind()) {
                    case UNRESOLVED -> unresolved.add(d);
                    case FALSE_NEGATIVE -> falseNeg.add(d);
                    case UNPARSEABLE -> unparseable.add(d);
                }
            }

            // Real totals — frozen here, used in header pill and footer line.
            int realUnresolved = unresolved.size();
            int realFalseNeg = falseNeg.size();
            int realUnparseable = unparseable.size();
            int realTotal = realUnresolved + realFalseNeg + realUnparseable;

            // ── FREE cap: keep first FREE_DIAGNOSTICS_LIMIT items in priority
            //    order (UNRESOLVED first, FALSE_NEGATIVE next, UNPARSEABLE
            //    last). Use new ArrayList<> to make defensive copies — sublist
            //    views are fragile if the source list is modified later. ──
            int hiddenUnresolved = 0;
            int hiddenFalseNeg = 0;
            int hiddenUnparseable = 0;
            boolean isFree = !req.isPro();
            if (isFree && realTotal > FREE_DIAGNOSTICS_LIMIT) {
                int slotsLeft = FREE_DIAGNOSTICS_LIMIT;

                if (unresolved.size() > slotsLeft) {
                    hiddenUnresolved = unresolved.size() - slotsLeft;
                    unresolved = new ArrayList<>(unresolved.subList(0, slotsLeft));
                    slotsLeft = 0;
                } else {
                    slotsLeft -= unresolved.size();
                }

                if (slotsLeft > 0) {
                    if (falseNeg.size() > slotsLeft) {
                        hiddenFalseNeg = falseNeg.size() - slotsLeft;
                        falseNeg = new ArrayList<>(falseNeg.subList(0, slotsLeft));
                        slotsLeft = 0;
                    } else {
                        slotsLeft -= falseNeg.size();
                    }
                } else {
                    hiddenFalseNeg = falseNeg.size();
                    falseNeg = new ArrayList<>();
                }

                if (slotsLeft > 0) {
                    if (unparseable.size() > slotsLeft) {
                        hiddenUnparseable = unparseable.size() - slotsLeft;
                        unparseable = new ArrayList<>(unparseable.subList(0, slotsLeft));
                    }
                    // else: fits entirely, nothing hidden
                } else {
                    hiddenUnparseable = unparseable.size();
                    unparseable = new ArrayList<>();
                }
            }

            // ── Header (title + pill on the right) ───────────────────
            doc.add(buildHeader(req, isFree));

            // Subtitle (focus FQN)
            String subtitleText = "Foco: " + safe(req.getFocusName());
            if (req.getFocusFqn() != null && !req.getFocusFqn().isBlank()) {
                subtitleText += "  ·  " + req.getFocusFqn();
            }
            Paragraph sub = new Paragraph(subtitleText,
                    FontFactory.getFont(FontFactory.COURIER, 9, MUTED));
            sub.setSpacingAfter(8);
            doc.add(sub);

            // Meta line
            String meta = "Generado: "
                    + ZonedDateTime.now(ZoneId.systemDefault()).format(HUMAN_TS);
            if (req.getProjectName() != null && !req.getProjectName().isBlank()) {
                meta += "  ·  Proyecto: " + req.getProjectName();
            }
            if (req.getJavaVersion() != null && !req.getJavaVersion().isBlank()) {
                meta += "  ·  Java " + req.getJavaVersion();
            }
            Paragraph metaP = new Paragraph(meta,
                    FontFactory.getFont(FontFactory.HELVETICA, 9, MUTED));
            metaP.setSpacingAfter(14);
            doc.add(metaP);

            // ── Intro ─────────────────────────────────────────────────
            Paragraph intro = new Paragraph(
                    "Lo que el análisis profundo no pudo confirmar. Cada item es un caso "
                            + "donde el parser falló al resolver, una mención textual que no se ligó "
                            + "a un símbolo, o un archivo que no se pudo parsear. Más info, menos "
                            + "ciegas: si una clase rompe pero no apareció arriba, capaz tenés un "
                            + "falso negativo.",
                    FontFactory.getFont(FontFactory.HELVETICA, 10, BODY));
            intro.setSpacingAfter(14);
            doc.add(intro);

            // ── Sections (with capped lists if FREE) ─────────────────
            if (all.isEmpty()) {
                doc.add(new Paragraph(
                        "No se reportaron diagnósticos. El análisis profundo resolvió "
                                + "todas las referencias detectadas.",
                        FontFactory.getFont(FontFactory.HELVETICA_OBLIQUE, 10, MUTED)));
            } else {
                renderSection(doc, "No resueltos", unresolved, WARN,
                        "El parser falló al resolver el símbolo (puede ser una referencia al foco).");
                renderSection(doc, "Posibles falsos negativos", falseNeg, BORDO,
                        "El nombre del foco aparece pero el símbolo no se confirmó. Revisar manualmente.");
                renderSection(doc, "Archivos no parseables", unparseable, ERROR,
                        "JavaParser no pudo abrir el archivo. Sintaxis rota o lombok delombok pendiente.");
            }

            // ── Locked PRO section (only when FREE has hidden items) ──
            int totalHidden = hiddenUnresolved + hiddenFalseNeg + hiddenUnparseable;
            if (isFree && totalHidden > 0) {
                renderLockedProSection(doc, totalHidden,
                        hiddenUnresolved, hiddenFalseNeg, hiddenUnparseable);
            }

            // ── Footer (real totals — never capped) ──────────────────
            doc.add(spacer(10));
            doc.add(hairline());
            Paragraph totals = new Paragraph(
                    "Total: " + realTotal
                            + "   ·   No resueltos: " + realUnresolved
                            + "   ·   Falsos negativos: " + realFalseNeg
                            + "   ·   No parseables: " + realUnparseable,
                    FontFactory.getFont(FontFactory.HELVETICA, 9, MUTED));
            totals.setAlignment(Element.ALIGN_RIGHT);
            doc.add(totals);

            doc.close();
        } catch (Exception e) {
            log.error("Failed to render diagnostics PDF", e);
            throw new RuntimeException("PDF generation failed", e);
        }

        byte[] bytes = out.toByteArray();
        log.info("Generated diagnostics PDF ({} bytes, {} findings, pro={})",
                bytes.length,
                req.getDiagnostics() == null ? 0 : req.getDiagnostics().size(),
                req.isPro());
        return bytes;
    }

    // ─────────────────────────────────────────────────────────────────
    // Layout helpers
    // ─────────────────────────────────────────────────────────────────

    /** Two-column header: title + subtitle on the left, FREE pill on the
     *  right (when applicable). PdfPTable is the robust path for cell-level
     *  background colors — Chunk's setBackground was flaky across viewers. */
    private PdfPTable buildHeader(DiagnosticsExportRequest req, boolean isFree) throws Exception {
        PdfPTable header = new PdfPTable(2);
        header.setWidths(new float[]{70, 30});
        header.setWidthPercentage(100);
        header.getDefaultCell().setBorder(Rectangle.NO_BORDER);

        // Left: title
        PdfPCell titleCell = new PdfPCell();
        titleCell.setBorder(Rectangle.NO_BORDER);
        titleCell.setPaddingBottom(2);
        titleCell.addElement(new Paragraph("Diagnóstico Marco Polo",
                FontFactory.getFont(FontFactory.HELVETICA_BOLD, 18, BORDO)));
        header.addCell(titleCell);

        // Right: pill (only when FREE)
        PdfPCell pillCell = new PdfPCell();
        pillCell.setBorder(Rectangle.NO_BORDER);
        pillCell.setHorizontalAlignment(Element.ALIGN_RIGHT);
        pillCell.setVerticalAlignment(Element.ALIGN_TOP);
        if (isFree) {
            // Inner table with a single cell that carries the pill background.
            // OpenPDF respects backgroundColor + padding on PdfPCell reliably,
            // unlike Chunk.setBackground.
            PdfPTable pillTable = new PdfPTable(1);
            pillTable.setTotalWidth(110);
            pillTable.setLockedWidth(true);
            pillTable.setHorizontalAlignment(Element.ALIGN_RIGHT);
            PdfPCell pill = new PdfPCell(new Phrase(
                    "FREE · " + FREE_DIAGNOSTICS_LIMIT + " mostrados",
                    FontFactory.getFont(FontFactory.HELVETICA_BOLD, 8, Color.WHITE)));
            pill.setBackgroundColor(BORDO);
            pill.setBorder(Rectangle.NO_BORDER);
            pill.setHorizontalAlignment(Element.ALIGN_CENTER);
            pill.setVerticalAlignment(Element.ALIGN_MIDDLE);
            pill.setPaddingTop(5);
            pill.setPaddingBottom(5);
            pill.setPaddingLeft(8);
            pill.setPaddingRight(8);
            pillTable.addCell(pill);
            pillCell.addElement(pillTable);
        }
        header.addCell(pillCell);

        return header;
    }

    private void renderSection(
            Document doc,
            String title,
            List<UnresolvedReference> items,
            Color accent,
            String hint) throws Exception {
        if (items.isEmpty()) return;

        // Section header
        Paragraph header = new Paragraph();
        header.add(new Chunk(title.toUpperCase(),
                FontFactory.getFont(FontFactory.HELVETICA_BOLD, 11, accent)));
        header.add(new Chunk("   " + items.size(),
                FontFactory.getFont(FontFactory.HELVETICA_BOLD, 11, MUTED)));
        header.setSpacingBefore(6);
        header.setSpacingAfter(2);
        doc.add(header);

        Paragraph hintP = new Paragraph(hint,
                FontFactory.getFont(FontFactory.HELVETICA_OBLIQUE, 9, MUTED));
        hintP.setSpacingAfter(6);
        doc.add(hintP);

        // Each item
        int idx = 1;
        for (UnresolvedReference d : items) {
            Paragraph item = new Paragraph();
            item.setIndentationLeft(8);
            item.setSpacingAfter(3);

            String pathLine = idx + ". " + safe(d.getFile());
            if (d.getLine() > 0) pathLine += ":" + d.getLine();
            item.add(new Chunk(pathLine + "\n",
                    FontFactory.getFont(FontFactory.HELVETICA, 9, BODY)));

            if (d.getSnippet() != null && !d.getSnippet().isBlank()) {
                item.add(new Chunk("    " + d.getSnippet() + "\n",
                        FontFactory.getFont(FontFactory.COURIER, 8, BORDO)));
            }
            if (d.getReason() != null && !d.getReason().isBlank()) {
                item.add(new Chunk("    ↳ " + d.getReason() + "\n",
                        FontFactory.getFont(FontFactory.HELVETICA_OBLIQUE, 8, MUTED)));
            }

            doc.add(item);
            idx++;
        }
    }

    /** Locked-PRO block at the end of the FREE PDF. Sells the upgrade with
     *  a concrete number ("55 más") and a per-category breakdown. */
    private void renderLockedProSection(
            Document doc,
            int totalHidden,
            int hiddenUnresolved,
            int hiddenFalseNeg,
            int hiddenUnparseable) throws Exception {
        doc.add(spacer(14));
        doc.add(hairline());

        Paragraph lockedTitle = new Paragraph(
                totalHidden + " DIAGNÓSTICOS MÁS DETECTADOS",
                FontFactory.getFont(FontFactory.HELVETICA_BOLD, 12, BORDO));
        lockedTitle.setSpacingBefore(6);
        lockedTitle.setSpacingAfter(2);
        doc.add(lockedTitle);

        Paragraph lockedSub = new Paragraph(
                "Disponibles en la versión PRO",
                FontFactory.getFont(FontFactory.HELVETICA_BOLD, 10, MUTED));
        lockedSub.setSpacingAfter(8);
        doc.add(lockedSub);

        String breakdown = breakdownText(hiddenUnresolved, hiddenFalseNeg, hiddenUnparseable);
        String body = "El análisis profundo encontró " + totalHidden
                + " zonas ciegas adicionales";
        if (!breakdown.isEmpty()) {
            body += " " + breakdown;
        }
        body += " que no se incluyen en el reporte FREE. Activá PRO para ver el "
                + "diagnóstico completo.";
        Paragraph lockedBody = new Paragraph(body,
                FontFactory.getFont(FontFactory.HELVETICA, 10, BODY));
        lockedBody.setSpacingAfter(8);
        doc.add(lockedBody);

        doc.add(hairline());
    }

    /** Build a "(50 no resueltos · 1 falso negativo · 4 no parseables)" text,
     *  omitting categories with zero hidden items. Empty string if all zero. */
    private String breakdownText(int unresolved, int falseNeg, int unparseable) {
        List<String> parts = new ArrayList<>();
        if (unresolved > 0) parts.add(unresolved + " no resueltos");
        if (falseNeg > 0) parts.add(falseNeg + " falso negativo"
                + (falseNeg == 1 ? "" : "s"));
        if (unparseable > 0) parts.add(unparseable + " no parseable"
                + (unparseable == 1 ? "" : "s"));
        if (parts.isEmpty()) return "";
        return "(" + String.join(" · ", parts) + ")";
    }

    private Paragraph spacer(int height) {
        Paragraph p = new Paragraph(" ");
        p.setSpacingAfter(height);
        return p;
    }

    private Paragraph hairline() {
        Paragraph p = new Paragraph(new Phrase(new Chunk(
                new com.lowagie.text.pdf.draw.LineSeparator(0.5f, 100, HAIRLINE,
                        Element.ALIGN_CENTER, -2))));
        p.setSpacingAfter(4);
        return p;
    }

    private String safe(String s) {
        return s == null ? "" : s;
    }
}
