// 读图里所有文字的位置（烧录字幕、歌词）：每张图输出一行 JSON {"file":..., "boxes":[[x0,y0,x1,y1,"text"],...]}，像素坐标、左上角原点
import Vision
import AppKit
for path in CommandLine.arguments.dropFirst() {
  guard let img = NSImage(contentsOfFile: path), let cg = img.cgImage(forProposedRect: nil, context: nil, hints: nil) else { continue }
  let W = Double(cg.width), H = Double(cg.height)
  let req = VNRecognizeTextRequest()
  req.recognitionLanguages = ["zh-Hans", "ko-KR", "en-US"]
  req.recognitionLevel = .accurate
  req.usesLanguageCorrection = false
  req.minimumTextHeight = 0.012
  try? VNImageRequestHandler(cgImage: cg).perform([req])
  var out: [[Any]] = []
  for r in req.results ?? [] {
    let b = r.boundingBox
    let t = r.topCandidates(1).first?.string ?? ""
    out.append([Int(b.minX * W), Int((1 - b.maxY) * H), Int(b.maxX * W), Int((1 - b.minY) * H), t])
  }
  let d = try! JSONSerialization.data(withJSONObject: ["file": path, "boxes": out])
  print(String(data: d, encoding: .utf8)!)
}
