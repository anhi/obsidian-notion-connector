import { RequestUrlParam, request } from "obsidian";

export { fetchUsingObsidianRequest };

const fetchUsingObsidianRequest = async (
	urlParam: Parameters<typeof fetch>[0],
	urlInit:  Parameters<typeof fetch>[1]
  ): ReturnType<typeof fetch> => {
	
	const url: RequestUrlParam = {
		url: ""
	}

	if (typeof urlParam == "string") {
		url.url = urlParam as string;
	} else if (urlParam instanceof URL) {
		url.url = urlParam.toString();
	} else {
		const ri = urlParam as Request

		url.url = ri.url
		url.method = ri.method
		
		if (ri.headers) {
			const headers: Record<string, string> = {}

			ri.headers.forEach((v,k) => headers[k] = v)
			url.headers = headers
		}

		if (ri.bodyUsed) {
			url.body = await ri.arrayBuffer()
		}
	}

	if (urlInit) {
		url.body = urlInit?.body?.toString()
		url.method = urlInit?.method

		if (urlInit?.headers) {
			url.headers = (urlInit?.headers as Record<string, string>)
		}
	}

	const responseOriginal = await request(url as RequestUrlParam);
	return new Response(responseOriginal)
  };