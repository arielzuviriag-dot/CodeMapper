package com.codemapper.service;

import com.codemapper.model.domain.FocusConnectionType;
import com.codemapper.model.dto.FocoMethodExportRequest;
import com.codemapper.model.event.FocusConnectionEvent;
import com.codemapper.model.event.FocusMethodLoadedEvent;
import com.lowagie.text.Chunk;
import com.lowagie.text.Document;
import com.lowagie.text.Element;
import com.lowagie.text.Font;
import com.lowagie.text.FontFactory;
import com.lowagie.text.PageSize;
import com.lowagie.text.Paragraph;
import com.lowagie.text.Phrase;
import com.lowagie.text.Rectangle;
import com.lowagie.text.pdf.ColumnText;
import com.lowagie.text.pdf.PdfContentByte;
import com.lowagie.text.pdf.PdfPageEventHelper;
import com.lowagie.text.pdf.PdfTemplate;
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
import java.util.Objects;

/**
 * Renders a FOCO METHOD analysis result as a printable PDF. Mirror of
 * {@link FocoPdfService} but anchored on a method instead of a class:
 * the title carries the method signature, the body is split into
 * "QUIÉN LO INVOCA" (callers, INVOKES_METHOD) and "A QUIÉN INVOCA"
 * (callees, INVOKES_OUTGOING) so the dev reads the report in
 * narrative order. Stateless; no I/O beyond writing.
 */
@Slf4j
@Service
public class FocoMethodPdfService {

    private static final Color BORDO = new Color(185, 28, 66);
    private static final Color BODY = new Color(20, 20, 20);
    private static final Color MUTED = new Color(110, 110, 115);
    private static final Color HAIRLINE = new Color(200, 200, 205);

    private static final DateTimeFormatter HUMAN_TS = DateTimeFormatter
            .ofPattern("yyyy-MM-dd HH:mm:ss z");

    public byte[] generatePdf(FocoMethodExportRequest req) {
        FocusMethodLoadedEvent focus = req.getFocusMethod();
        List<FocusConnectionEvent> conns = req.getConnections() == null
                ? List.of() : req.getConnections();

        List<FocusConnectionEvent> incoming = new ArrayList<>();
        List<FocusConnectionEvent> outgoing = new ArrayList<>();
        for (FocusConnectionEvent c : conns) {
            if (c.getConnectionType() == FocusConnectionType.INVOKES_METHOD) {
                incoming.add(c);
            } else if (c.getConnectionType() == FocusConnectionType.INVOKES_OUTGOING) {
                outgoing.add(c);
            }
        }

        Document doc = new Document(PageSize.A4, 42, 42, 70, 50);
        ByteArrayOutputStream out = new ByteArrayOutputStream();
        PdfWriter writer = PdfWriter.getInstance(doc, out);
        HeaderFooter handler = new HeaderFooter(focus, req.isPro());
        writer.setPageEvent(handler);

        try {
            doc.open();

            // ── Title block ───────────────────────────────────────────
            doc.add(titleParagraph("Reporte Marco Polo Método"));
            doc.add(subtitleParagraph(focus));
            doc.add(spacer(10));

            // ── Summary ──────────────────────────────────────────────
            doc.add(sectionHeader("Resumen"));
            doc.add(summaryParagraph(req, incoming.size(), outgoing.size()));
            if (req.isLimitApplied()) {
                doc.add(noticeParagraph(
                        "Mostrando " + conns.size() + " de " + req.getTotalAvailable()
                                + " conexiones detectadas. Activá PRO para ver toda la cadena."));
            }
            doc.add(spacer(14));

            // ── Section: who calls this method ───────────────────────
            doc.add(sectionHeader("Quién lo invoca (" + incoming.size() + ")"));
            if (incoming.isEmpty()) {
                doc.add(bodyParagraph("Sin invocaciones detectadas en el proyecto."));
            } else {
                for (int i = 0; i < incoming.size(); i++) {
                    addConnectionBlock(doc, incoming.get(i), focus, i + 1);
                }
            }
            doc.add(spacer(14));

            // ── Section: what this method calls ──────────────────────
            doc.add(sectionHeader("A quién invoca (" + outgoing.size() + ")"));
            if (outgoing.isEmpty()) {
                doc.add(bodyParagraph(
                        "Este método no invoca otras clases del proyecto."));
            } else {
                for (int i = 0; i < outgoing.size(); i++) {
                    addConnectionBlock(doc, outgoing.get(i), focus, i + 1);
                }
            }

        } catch (Exception e) {
            log.error("Failed to generate FOCO METHOD PDF", e);
            throw new RuntimeException("PDF generation failed: " + e.getMessage(), e);
        } finally {
            try { doc.close(); } catch (Exception ignored) {}
        }
        return out.toByteArray();
    }

    // ───────────────────────────── building blocks ─────────────────────

    private void addConnectionBlock(Document doc,
                                    FocusConnectionEvent conn,
                                    FocusMethodLoadedEvent focus,
                                    int index) throws Exception {
        boolean inbound = conn.getConnectionType() == FocusConnectionType.INVOKES_METHOD;
        String typeLabel = inbound ? "INVOCADO POR" : "INVOCA A";

        Paragraph titleLine = new Paragraph();
        titleLine.add(new Chunk("[" + index + "] ", font(11, true, MUTED)));
        titleLine.add(new Chunk(safeStr(conn.getName()), font(12, true, BORDO)));
        titleLine.add(new Chunk("   " + typeLabel, font(9, true, MUTED)));
        titleLine.setSpacingBefore(8);
        titleLine.setSpacingAfter(2);
        doc.add(titleLine);

        Paragraph fqn = new Paragraph(safeStr(conn.getFullyQualifiedName()),
                monoFont(9, BODY));
        fqn.setSpacingAfter(2);
        doc.add(fqn);

        // Direction reads naturally: callers → focus, focus → callees.
        String origin;
        String destination;
        String focusLabel = focus.getContainingClass() + "." + focus.getMethodName() + "()";
        if (inbound) {
            origin = safeStr(conn.getName());
            destination = focusLabel;
        } else {
            origin = focusLabel;
            destination = safeStr(conn.getName())
                    + (conn.getViaMethodInTarget() != null
                            ? "." + conn.getViaMethodInTarget() + "()"
                            : "");
        }
        Paragraph direction = new Paragraph();
        direction.add(new Chunk("Origen → Destino: ", font(9, false, MUTED)));
        direction.add(new Chunk(origin + " → " + destination, monoFont(9, BODY)));
        direction.setSpacingAfter(2);
        doc.add(direction);

        // Via-method context: which method on the source side triggers the
        // relationship. For inbound, that's the caller's method; for
        // outbound, it's irrelevant (focus method IS the source) but we
        // surface the called-method via the destination already.
        if (inbound && conn.getViaMethodInSource() != null
                && !conn.getViaMethodInSource().isBlank()) {
            Paragraph via = new Paragraph();
            via.add(new Chunk("Via método: ", font(9, false, MUTED)));
            via.add(new Chunk(conn.getViaMethodInSource() + "()", monoFont(9, BODY)));
            via.setSpacingAfter(2);
            doc.add(via);
        }

        // Control-flow context for outbound calls (if/loop/try/...).
        if (!inbound && conn.getControlContext() != null
                && !conn.getControlContext().isBlank()) {
            Paragraph ctx = new Paragraph();
            ctx.add(new Chunk("Contexto: ", font(9, false, MUTED)));
            ctx.add(new Chunk(conn.getControlContext().toLowerCase().replace('_', ' '),
                    monoFont(9, BODY)));
            ctx.setSpacingAfter(2);
            doc.add(ctx);
        }

        // Source file
        if (conn.getSourceFile() != null && !conn.getSourceFile().isBlank()) {
            Paragraph srcLine = new Paragraph();
            srcLine.add(new Chunk("Archivo: ", font(9, false, MUTED)));
            srcLine.add(new Chunk(conn.getSourceFile(), monoFont(8, BODY)));
            srcLine.setSpacingAfter(2);
            doc.add(srcLine);
        }

        // Counts
        int fields = conn.getFields() == null ? 0 : conn.getFields().size();
        int methods = conn.getMethods() == null ? 0 : conn.getMethods().size();
        Paragraph counts = new Paragraph(
                fields + " campos · " + methods + " métodos",
                font(9, false, MUTED));
        counts.setSpacingAfter(2);
        doc.add(counts);
    }

    private Paragraph titleParagraph(String text) {
        Paragraph p = new Paragraph(text, font(20, true, BORDO));
        p.setSpacingAfter(2);
        return p;
    }

    private Paragraph subtitleParagraph(FocusMethodLoadedEvent focus) {
        Paragraph p = new Paragraph();
        p.add(new Chunk(focus.getContainingClass() + "." + focus.getMethodName() + "()",
                font(13, true, BODY)));
        p.add(new Chunk("\n" + safeStr(focus.getSignature()), monoFont(9, MUTED)));
        p.add(new Chunk("\n" + safeStr(focus.getContainingClassFullyQualifiedName()),
                monoFont(8, MUTED)));
        p.setSpacingAfter(6);
        return p;
    }

    private Paragraph sectionHeader(String text) {
        Paragraph p = new Paragraph(text.toUpperCase(),
                font(11, true, BORDO));
        p.setSpacingBefore(6);
        p.setSpacingAfter(4);
        return p;
    }

    private Paragraph summaryParagraph(FocoMethodExportRequest req,
                                       int incomingCount,
                                       int outgoingCount) {
        Paragraph p = new Paragraph();
        p.add(new Chunk("Plan: ", font(10, false, MUTED)));
        p.add(new Chunk(req.isPro() ? "PRO" : "FREE",
                font(10, true, req.isPro() ? BODY : BORDO)));
        p.add(new Chunk("    Invocadores: ", font(10, false, MUTED)));
        p.add(new Chunk(String.valueOf(incomingCount), font(10, true, BODY)));
        p.add(new Chunk("    Invocados: ", font(10, false, MUTED)));
        p.add(new Chunk(String.valueOf(outgoingCount), font(10, true, BODY)));
        if (req.isLimitApplied()) {
            p.add(new Chunk(" / " + req.getTotalAvailable() + " detectadas",
                    font(10, false, MUTED)));
        }
        p.setSpacingAfter(4);
        return p;
    }

    private Paragraph noticeParagraph(String text) {
        Paragraph p = new Paragraph();
        p.add(new Chunk("⚠ ", font(10, true, BORDO)));
        p.add(new Chunk(text, font(10, false, BODY)));
        p.setSpacingBefore(2);
        p.setSpacingAfter(4);
        return p;
    }

    private Paragraph bodyParagraph(String text) {
        Paragraph p = new Paragraph(text, font(10, false, BODY));
        p.setSpacingAfter(2);
        return p;
    }

    private Paragraph spacer(float height) {
        Paragraph p = new Paragraph(" ", font(1, false, BODY));
        p.setSpacingAfter(height);
        return p;
    }

    private Font font(float size, boolean bold, Color color) {
        int style = bold ? Font.BOLD : Font.NORMAL;
        return FontFactory.getFont(FontFactory.HELVETICA, size, style, color);
    }

    private Font monoFont(float size, Color color) {
        return FontFactory.getFont(FontFactory.COURIER, size, Font.NORMAL, color);
    }

    private static String safeStr(String s) {
        return s == null ? "" : s;
    }

    /** Header (project + date + plan) and footer (page X / Y) on every page. */
    private static class HeaderFooter extends PdfPageEventHelper {
        private final FocusMethodLoadedEvent focus;
        private final boolean pro;
        private PdfTemplate totalPageTemplate;
        private final String dateString;

        HeaderFooter(FocusMethodLoadedEvent focus, boolean pro) {
            this.focus = focus;
            this.pro = pro;
            this.dateString = ZonedDateTime.now(ZoneId.systemDefault()).format(HUMAN_TS);
        }

        @Override
        public void onOpenDocument(PdfWriter writer, Document document) {
            totalPageTemplate = writer.getDirectContent().createTemplate(35, 12);
        }

        @Override
        public void onEndPage(PdfWriter writer, Document doc) {
            PdfContentByte cb = writer.getDirectContent();
            Rectangle ps = doc.getPageSize();
            float right = ps.getWidth() - 42;
            float top = ps.getHeight() - 28;
            float bottom = 30;

            Phrase appName = new Phrase("CodeMapper — Reporte Marco Polo Método",
                    FontFactory.getFont(FontFactory.HELVETICA_BOLD, 9, BORDO));
            ColumnText.showTextAligned(cb, Element.ALIGN_LEFT, appName, 42, top, 0);

            String planTag = pro ? "PRO" : "FREE";
            String focusLabel = focus == null
                    ? ""
                    : Objects.toString(focus.getContainingClass(), "")
                            + "." + Objects.toString(focus.getMethodName(), "") + "()";
            Phrase ctx = new Phrase(dateString + "  ·  " + planTag + "  ·  " + focusLabel,
                    FontFactory.getFont(FontFactory.HELVETICA, 8, MUTED));
            ColumnText.showTextAligned(cb, Element.ALIGN_RIGHT, ctx, right, top, 0);

            cb.setColorStroke(HAIRLINE);
            cb.setLineWidth(0.4f);
            cb.moveTo(42, top - 6);
            cb.lineTo(right, top - 6);
            cb.stroke();

            Phrase footerLeft = new Phrase("Generado con CodeMapper",
                    FontFactory.getFont(FontFactory.HELVETICA, 8, MUTED));
            ColumnText.showTextAligned(cb, Element.ALIGN_LEFT, footerLeft, 42, bottom, 0);

            Phrase pageX = new Phrase("Página " + writer.getPageNumber() + " / ",
                    FontFactory.getFont(FontFactory.HELVETICA, 8, MUTED));
            float centerX = ps.getWidth() / 2f;
            ColumnText.showTextAligned(cb, Element.ALIGN_RIGHT, pageX, centerX + 8, bottom, 0);
            cb.addTemplate(totalPageTemplate, centerX + 10, bottom - 1);
        }

        @Override
        public void onCloseDocument(PdfWriter writer, Document document) {
            ColumnText.showTextAligned(totalPageTemplate, Element.ALIGN_LEFT,
                    new Phrase(String.valueOf(writer.getPageNumber() - 1),
                            FontFactory.getFont(FontFactory.HELVETICA, 8, MUTED)),
                    0, 1, 0);
        }
    }
}
