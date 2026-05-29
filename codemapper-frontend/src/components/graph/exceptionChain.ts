import type {
  ExceptionCausePayload,
  ExceptionFramePayload,
  ExceptionReportPayload,
  MobileOriginPayload,
} from "@/lib/types";

/**
 * Ordered user-code chain: entry → … → root-cause throw site (the focus).
 * Walks causes outer→deeper and, within each, bottom(entry)→top(throw), keeping
 * only the user's own frames and de-duping exact (class+method+line) repeats.
 * The LAST element is the focus = where the error was actually thrown.
 */
export function buildClassChain(
  causes: ExceptionCausePayload[],
): ExceptionFramePayload[] {
  const out: ExceptionFramePayload[] = [];
  const seen = new Set<string>();
  for (const cause of causes) {
    const rev = [...cause.frames].reverse();
    for (const f of rev) {
      if (!f.userCode) continue;
      const key = `${f.classId}|${f.methodName}|${f.lineNumber}`;
      if (seen.has(key)) continue;
      seen.add(key);
      out.push(f);
    }
  }
  return out;
}

export type ChainStep =
  | {
      kind: "screen";
      screenName: string;
      screenFile: string;
      apiFunction: string;
      method: string;
      path: string;
      attachClassId: string;
    }
  | {
      kind: "class";
      classId: string | null;
      simpleName: string;
      methodName: string;
      lineNumber: number;
      isFocus: boolean;
    };

/**
 * Full step-by-step narrative: mobile screen origin(s) first (where it
 * started), then each Java class in execution order, ending at the error.
 */
export function buildSteps(
  report: ExceptionReportPayload,
  mobileOrigins: MobileOriginPayload[],
): ChainStep[] {
  const chain = buildClassChain(report.causes);
  const steps: ChainStep[] = [];

  // De-dupe screens by file so the same screen isn't listed twice.
  const seenScreens = new Set<string>();
  for (const o of mobileOrigins) {
    if (seenScreens.has(o.screenFile)) continue;
    seenScreens.add(o.screenFile);
    steps.push({
      kind: "screen",
      screenName: o.screenName,
      screenFile: o.screenFile,
      apiFunction: o.apiFunction,
      method: o.method,
      path: o.path,
      attachClassId: o.attachClassId,
    });
  }

  chain.forEach((f, i) => {
    steps.push({
      kind: "class",
      classId: f.classId,
      simpleName: f.simpleName,
      methodName: f.methodName,
      lineNumber: f.lineNumber,
      isFocus: i === chain.length - 1,
    });
  });

  return steps;
}
