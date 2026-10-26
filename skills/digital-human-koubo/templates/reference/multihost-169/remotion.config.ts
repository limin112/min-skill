import { Config } from "@remotion/cli/config";

Config.setVideoImageFormat("jpeg");
Config.setJpegQuality(95);
if (!process.env.AUDIO_ONLY) Config.setCodec("h264");
if (!process.env.AUDIO_ONLY) Config.setCrf(16);
if (!process.env.AUDIO_ONLY) Config.setPixelFormat("yuv420p");
Config.setChromiumOpenGlRenderer("angle");
