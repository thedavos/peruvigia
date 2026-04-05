import { readdir, readFile } from "node:fs/promises";
import path from "node:path";

import { fetchResponse } from "#api/fetch";

import { CONTRALORIA_PUBLICATION_SLUG, CONTRALORIA_REPORTS_LIST_URL } from "./types";
import type { AcquireOptions, ContraloriaFamily, SourceAttachment } from "./types";

function toAbsoluteUrl(candidate: string, baseUrl: string) {
  return new URL(candidate, baseUrl).toString();
}

function decodeHtmlAttribute(value: string) {
  return value.replaceAll("&amp;", "&");
}

function inferFamily(value: string): ContraloriaFamily {
  const normalized = value.toLowerCase();

  if (normalized.includes("29622")) {
    return "ley_29622";
  }

  if (normalized.includes("31288")) {
    return "ley_31288";
  }

  if (normalized.includes("difer")) {
    return "diferidas";
  }

  return "unknown";
}

function inferReportDate(html: string) {
  const datetimeMatch = html.match(/datetime="(\d{4}-\d{2}-\d{2})/i);
  if (datetimeMatch?.[1]) {
    return datetimeMatch[1];
  }

  const dateMatch = html.match(/\b(\d{4}-\d{2}-\d{2})\b/);
  return dateMatch?.[1] ?? new Date().toISOString().slice(0, 10);
}

function extractLatestPublicationUrl(html: string) {
  const matches = [...html.matchAll(/href="([^"]+)"/gi)]
    .map((match) => decodeHtmlAttribute(match[1] ?? ""))
    .filter((href) => href.includes(CONTRALORIA_PUBLICATION_SLUG))
    .map((href) => toAbsoluteUrl(href, "https://www.gob.pe"))
    .filter((href, index, values) => values.indexOf(href) === index);

  if (matches.length === 0) {
    throw new Error("Could not find the latest Contraloria sanctions publication URL.");
  }

  const latestPublicationUrl = matches.sort((left, right) => right.localeCompare(left))[0];

  if (!latestPublicationUrl) {
    throw new Error("Could not determine the latest Contraloria sanctions publication URL.");
  }

  return latestPublicationUrl;
}

function extractAttachmentUrls(html: string, reportUrl: string) {
  const matches = [...html.matchAll(/href="([^"]+)"/gi)]
    .map((match) => decodeHtmlAttribute(match[1] ?? ""))
    .filter((href) => href.toLowerCase().includes(".xlsx"))
    .map((href) => toAbsoluteUrl(href, reportUrl))
    .filter((href, index, values) => values.indexOf(href) === index);

  if (matches.length === 0) {
    throw new Error(`Could not find XLSX attachments in ${reportUrl}.`);
  }

  return matches;
}

async function fetchText(url: string) {
  const response = await fetchResponse(url);
  if (!response.ok) {
    throw new Error(`Failed to fetch ${url}: ${response.status} ${response.statusText}`);
  }

  return await response.text();
}

async function fetchBuffer(url: string) {
  const response = await fetchResponse(url);
  if (!response.ok) {
    throw new Error(`Failed to download ${url}: ${response.status} ${response.statusText}`);
  }

  return Buffer.from(await response.arrayBuffer());
}

async function acquireFromInputDir(
  inputDir: string,
  reportUrl?: string,
): Promise<SourceAttachment[]> {
  const entries = await readdir(inputDir, {
    withFileTypes: true,
  });

  const files = entries
    .filter((entry) => entry.isFile() && entry.name.toLowerCase().endsWith(".xlsx"))
    .map((entry) => entry.name)
    .sort();

  if (files.length === 0) {
    throw new Error(`No XLSX files were found in ${inputDir}.`);
  }

  const effectiveReportUrl = reportUrl ?? new URL(`file://${inputDir}/`).toString();
  const reportDate = new Date().toISOString().slice(0, 10);

  return await Promise.all(
    files.map(async (fileName) => {
      const absolutePath = path.join(inputDir, fileName);

      return {
        attachmentUrl: new URL(`file://${absolutePath}`).toString(),
        family: inferFamily(fileName),
        fileName,
        reportDate,
        reportUrl: effectiveReportUrl,
        workbookData: await readFile(absolutePath),
      };
    }),
  );
}

async function acquireFromRemoteReport(reportUrl: string): Promise<SourceAttachment[]> {
  const normalizedReportUrl = reportUrl.endsWith(".xlsx")
    ? reportUrl
    : reportUrl.startsWith("http")
      ? reportUrl
      : toAbsoluteUrl(reportUrl, "https://www.gob.pe");

  if (normalizedReportUrl.toLowerCase().endsWith(".xlsx")) {
    const fileName = path.basename(new URL(normalizedReportUrl).pathname);
    return [
      {
        attachmentUrl: normalizedReportUrl,
        family: inferFamily(fileName),
        fileName,
        reportDate: new Date().toISOString().slice(0, 10),
        reportUrl: normalizedReportUrl,
        workbookData: await fetchBuffer(normalizedReportUrl),
      },
    ];
  }

  const html = await fetchText(normalizedReportUrl);
  const reportDate = inferReportDate(html);
  const attachmentUrls = extractAttachmentUrls(html, normalizedReportUrl);

  return await Promise.all(
    attachmentUrls.map(async (attachmentUrl) => {
      const fileName = path.basename(new URL(attachmentUrl).pathname);

      return {
        attachmentUrl,
        family: inferFamily(fileName),
        fileName,
        reportDate,
        reportUrl: normalizedReportUrl,
        workbookData: await fetchBuffer(attachmentUrl),
      };
    }),
  );
}

export async function acquireContraloriaAttachments(
  options: AcquireOptions = {},
): Promise<SourceAttachment[]> {
  if (options.inputDir) {
    return acquireFromInputDir(options.inputDir, options.reportUrl);
  }

  const reportUrl =
    options.reportUrl ?? extractLatestPublicationUrl(await fetchText(CONTRALORIA_REPORTS_LIST_URL));

  return acquireFromRemoteReport(reportUrl);
}

export { inferFamily };
