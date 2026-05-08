package com.codemapper.service;

import com.codemapper.model.dto.JacocoCoverage;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;
import org.w3c.dom.Document;
import org.w3c.dom.Element;
import org.w3c.dom.Node;
import org.w3c.dom.NodeList;
import org.xml.sax.InputSource;

import javax.xml.XMLConstants;
import javax.xml.parsers.DocumentBuilder;
import javax.xml.parsers.DocumentBuilderFactory;
import java.io.IOException;
import java.io.StringReader;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.Optional;

/**
 * Reads a Jacoco {@code jacoco.xml} report from the analyzed project (if it
 * exists) and turns it into a {@link JacocoCoverage} snapshot. Returns
 * {@link Optional#empty()} when no report can be found — that's the silent
 * fallback the F3 plan calls for: no donut, no fake number.
 *
 * Search paths checked, in order:
 * <ol>
 *   <li>{@code target/site/jacoco/jacoco.xml} — Maven default</li>
 *   <li>{@code build/reports/jacoco/test/jacocoTestReport.xml} — Gradle default</li>
 *   <li>{@code build/reports/jacoco/jacoco.xml} — Gradle alt</li>
 * </ol>
 *
 * The Jacoco XML schema we read:
 * <pre>{@code
 * <report>
 *   <package name="com/foo">
 *     <class name="com/foo/Bar">
 *       <method name="baz" desc="...">
 *         <counter type="LINE" missed="X" covered="Y"/>
 *       </method>
 *       <counter type="LINE" missed="X" covered="Y"/>
 *     </class>
 *   </package>
 * </report>
 * }</pre>
 *
 * Coverage % uses LINE counters: {@code covered / (covered + missed) * 100}.
 */
@Slf4j
@Service
public class JacocoReportParser {

    private static final List<String> CANDIDATE_PATHS = List.of(
            "target/site/jacoco/jacoco.xml",
            "build/reports/jacoco/test/jacocoTestReport.xml",
            "build/reports/jacoco/jacoco.xml"
    );

    public Optional<JacocoCoverage> findAndParse(Path projectRoot) {
        if (projectRoot == null) return Optional.empty();
        for (String rel : CANDIDATE_PATHS) {
            Path candidate = projectRoot.resolve(rel);
            if (Files.isRegularFile(candidate)) {
                log.info("Jacoco XML found at {}", candidate);
                return parse(candidate);
            }
        }
        log.info("No Jacoco XML found under {} — coverage will be null", projectRoot);
        return Optional.empty();
    }

    private Optional<JacocoCoverage> parse(Path xmlPath) {
        try {
            String content = Files.readString(xmlPath);
            DocumentBuilderFactory dbf = DocumentBuilderFactory.newInstance();
            // Hard-disable external DTD/entity loading. Jacoco reports declare
            // a DOCTYPE that points at report.dtd inside the jar — fetching
            // it slows parsing and sometimes fails offline.
            dbf.setAttribute(XMLConstants.ACCESS_EXTERNAL_DTD, "");
            dbf.setAttribute(XMLConstants.ACCESS_EXTERNAL_SCHEMA, "");
            dbf.setFeature("http://apache.org/xml/features/nonvalidating/load-external-dtd", false);
            dbf.setFeature("http://xml.org/sax/features/external-general-entities", false);
            dbf.setFeature("http://xml.org/sax/features/external-parameter-entities", false);
            DocumentBuilder db = dbf.newDocumentBuilder();
            db.setEntityResolver((publicId, systemId) -> new InputSource(new StringReader("")));
            Document doc = db.parse(new InputSource(new StringReader(content)));

            Map<String, Double> classCoverage = new HashMap<>();
            Map<String, Double> methodCoverage = new HashMap<>();

            NodeList classNodes = doc.getElementsByTagName("class");
            for (int i = 0; i < classNodes.getLength(); i++) {
                Element classEl = (Element) classNodes.item(i);
                String classNameSlash = classEl.getAttribute("name"); // e.g. com/foo/Bar
                if (classNameSlash == null || classNameSlash.isBlank()) continue;
                String fqn = classNameSlash.replace('/', '.');

                Double classPct = computeLinePercent(classEl);
                if (classPct != null) {
                    classCoverage.put(fqn, classPct);
                }

                NodeList methodNodes = classEl.getElementsByTagName("method");
                for (int m = 0; m < methodNodes.getLength(); m++) {
                    Element methodEl = (Element) methodNodes.item(m);
                    String methodName = methodEl.getAttribute("name");
                    if (methodName == null || methodName.isBlank()) continue;
                    Double methodPct = computeLinePercent(methodEl);
                    if (methodPct != null) {
                        methodCoverage.put(fqn + "." + methodName, methodPct);
                    }
                }
            }

            log.info("Parsed Jacoco report: {} classes, {} methods with coverage data",
                    classCoverage.size(), methodCoverage.size());
            return Optional.of(new JacocoCoverage(classCoverage, methodCoverage));
        } catch (IOException | RuntimeException | javax.xml.parsers.ParserConfigurationException
                 | org.xml.sax.SAXException e) {
            log.warn("Failed to parse Jacoco report at {}: {}", xmlPath, e.getMessage());
            return Optional.empty();
        }
    }

    /** Pull the LINE counter that's a direct child of {@code parent} (NOT
     *  recursive — we don't want a class's counter to absorb its methods'
     *  counters again) and convert to percent. Returns null when there's no
     *  LINE counter at all (interfaces, abstract classes with no body). */
    private Double computeLinePercent(Element parent) {
        NodeList children = parent.getChildNodes();
        for (int i = 0; i < children.getLength(); i++) {
            Node n = children.item(i);
            if (n.getNodeType() != Node.ELEMENT_NODE) continue;
            Element c = (Element) n;
            if (!"counter".equals(c.getTagName())) continue;
            if (!"LINE".equals(c.getAttribute("type"))) continue;
            try {
                int missed = Integer.parseInt(c.getAttribute("missed"));
                int covered = Integer.parseInt(c.getAttribute("covered"));
                int total = missed + covered;
                if (total == 0) return 0.0;
                return (covered * 100.0) / total;
            } catch (NumberFormatException ignored) {
                return null;
            }
        }
        return null;
    }
}
