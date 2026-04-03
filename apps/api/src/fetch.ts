export type FetchResponseLike = Awaited<ReturnType<typeof fetch>> & {
  arrayBuffer(): Promise<ArrayBuffer>;
  json(): Promise<unknown>;
  ok: boolean;
  status: number;
  statusText: string;
  text(): Promise<string>;
};

export async function fetchResponse(url: string, fetchImpl: typeof fetch = fetch) {
  return (await fetchImpl(url)) as FetchResponseLike;
}
