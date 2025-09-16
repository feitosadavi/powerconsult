type GenerateHeadersInput = {
  Host: string;
  Origin: string;
  Referer: string;
};

export const generateHeaders = (input: GenerateHeadersInput) => ({
  ...input,
  "User-Agent":
    "Mozilla/5.0 (X11; Linux x86_64; rv:131.0) Gecko/20100101 Firefox/131.0",
  Accept: "application/json, text/plain, */*",
  "Accept-Language": "en-US,en;q=0.5",
  "Accept-Encoding": "gzip, deflate, br, zstd",
  "Application-Id": "dd438fd30de6de289ab81eb043e8fb92",
  canal: "GoPan FrontEnd",
  loja: "",
  "Content-Type": "application/json",
  Connection: "keep-alive",
  "Sec-Fetch-Dest": "empty",
  "Sec-Fetch-Mode": "cors",
  "Sec-Fetch-Site": "same-site",
  TE: "trailers",
  // ⚠️ Optional: Only include cookies if you have them and are authorized
  // "Cookie": "your_cookie_string_here"
});
