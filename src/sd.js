import config from "./config.js";

export async function sdStatus() {
  try {
    const res = await fetch(`${config.localImageUrl}/sdapi/v1/options`, {
      signal: AbortSignal.timeout(2500),
    });
    return { up: res.ok };
  } catch {
    return { up: false };
  }
}

/**
 * Generate an image with the local Stable Diffusion Forge API.
 * @param {string} prompt  English prompt
 * @param {{negative?:string,width?:number,height?:number,steps?:number,seed?:number}} opts
 */
export async function txt2imgLocal(
  prompt,
  { negative = "", width = 512, height = 512, steps, seed = -1 } = {}
) {
  const res = await fetch(`${config.localImageUrl}/sdapi/v1/txt2img`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      prompt: String(prompt),
      negative_prompt: String(negative),
      width,
      height,
      steps: steps || config.localImageSteps,
      cfg_scale: 7,
      seed,
      sampler_name: "Euler a",
      batch_size: 1,
      restore_faces: false,
    }),
    signal: AbortSignal.timeout(240000),
  });
  if (!res.ok) throw new Error(`SD_HTTP_${res.status}`);
  const data = await res.json();
  const img = data.images && data.images[0];
  if (!img) throw new Error("SD_EMPTY");
  return { buffer: Buffer.from(img, "base64"), mime: "image/png", info: data.info || "" };
}

export async function listLocalModels() {
  try {
    const res = await fetch(`${config.localImageUrl}/sdapi/v1/sd-models`, {
      signal: AbortSignal.timeout(4000),
    });
    if (!res.ok) return [];
    const data = await res.json();
    return (data || []).map((m) => ({ name: m.model_name, title: m.title }));
  } catch {
    return [];
  }
}
