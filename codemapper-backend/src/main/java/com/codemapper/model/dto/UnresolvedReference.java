package com.codemapper.model.dto;

import lombok.AllArgsConstructor;
import lombok.Data;
import lombok.NoArgsConstructor;

/**
 * One diagnostic finding produced during deep body analysis. Surfaced to the
 * frontend so the dev sees what we couldn't confirm — making the trade-off
 * between symbol-resolver accuracy and code reality visible instead of
 * silently dropping cases.
 *
 * Three kinds:
 * <ul>
 *   <li><b>UNRESOLVED</b> — JavaParser symbol solver failed on an expression
 *   that *might* reference the focus (or another project class). The file
 *   compiles, but our parser can't trace it to a concrete FQN.</li>
 *   <li><b>FALSE_NEGATIVE</b> — the focus's simple name (e.g. "User") appears
 *   textually in a body but symbol resolution didn't confirm it as the focus
 *   FQN. Could be a same-named class from another package, a comment, or a
 *   real reference we missed.</li>
 *   <li><b>UNPARSEABLE</b> — JavaParser couldn't even build an AST for this
 *   file (broken syntax, unsupported language level, lombok delombok needed).
 *   The file is invisible to all analysis.</li>
 * </ul>
 */
@Data
@NoArgsConstructor
@AllArgsConstructor
public class UnresolvedReference {
    public enum Kind {
        UNRESOLVED,
        FALSE_NEGATIVE,
        UNPARSEABLE
    }

    private Kind kind;
    /** Absolute path to the source file. Frontend strips the project root for display. */
    private String file;
    /** 1-based line number, or 0 when not applicable (e.g. UNPARSEABLE). */
    private int line;
    /** Trimmed snippet of the offending line. Empty when line is 0. */
    private String snippet;
    /** Short reason. Free-text — keeps caller flexibility for future kinds. */
    private String reason;
}
