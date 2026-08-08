export type EventSubmissionReplyPresentation = {
  message: string;
  quotedMessage: string | null;
};

function compactLines(lines: string[]): string {
  return lines
    .map((line) => line.trimEnd())
    .reduce<string[]>((result, line) => {
      if (!line.trim() && result.at(-1) === '') return result;
      result.push(line);
      return result;
    }, [])
    .join('\n')
    .trim();
}

function replyBoundaryIndex(lines: string[]): number {
  return lines.findIndex((line) => /^on\s.*\bwrote:\s*$/i.test(line.trim()));
}

function quoteMarkerIndex(lines: string[]): number {
  return lines.findIndex((line, index) => index > 0 && /^>\s?/.test(line));
}

function cleanQuotedMessage(lines: string[]): string {
  return compactLines(lines
    .map((line) => line.replace(/^>\s?/, ''))
    .filter((line) => !/^\[image:[^\]]+\]$/i.test(line.trim()))
    .map((line) => line.replace(/<((?:https?:\/\/)[^>\s]+)>/gi, '$1')),
  );
}

export function presentEventSubmissionReply(body: string): EventSubmissionReplyPresentation {
  const lines = body.replace(/\r\n?/g, '\n').split('\n');
  const replyBoundary = replyBoundaryIndex(lines);
  const quoteStart = replyBoundary >= 0 ? replyBoundary : quoteMarkerIndex(lines);
  if (quoteStart < 0) {
    return { message: compactLines(lines) || '(No message body)', quotedMessage: null };
  }

  const message = compactLines(lines.slice(0, quoteStart));
  const quotedMessage = cleanQuotedMessage(lines.slice(replyBoundary >= 0 ? quoteStart + 1 : quoteStart));
  return {
    message: message || '(No message body)',
    quotedMessage: quotedMessage || null,
  };
}
