// 只认韩文（小字常被混合语言模型漏掉）：输入图，输出 JSON 框（像素坐标）
import Vision
import AppKit
for path in CommandLine.arguments.dropFirst() {
  guard let img = NSImage(contentsOfFile: path), let cg = img.cgImage(forProposedRect: nil, context: nil, hints: nil) else { continue }
  let W = Double(cg.width), H = Double(cg.height)
  let req = VNRecognizeTextRequest()
  req.recognitionLanguages = ["ko-KR"]
  req.recognitionLevel = .accurate
  req.usesLanguageCorrection = false
  try? VNImageRequestHandler(cgImage: cg).perform([req])
  var out: [[Any]] = []
  for r in req.results ?? [] { let b = r.boundingBox; out.append([Int(b.minX*W), Int((1-b.maxY)*H), Int(b.maxX*W), Int((1-b.minY)*H), r.topCandidates(1).first?.string ?? ""]) }
  print(String(data: try! JSONSerialization.data(withJSONObject: ["file": path, "boxes": out]), encoding: .utf8)!)
}
