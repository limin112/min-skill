import Vision
import AppKit
let dir = CommandLine.arguments[1]
let files = try! FileManager.default.contentsOfDirectory(atPath: dir).filter{$0.hasSuffix(".png")}.sorted()
for f in files {
  guard let img = NSImage(contentsOfFile: dir+"/"+f), let cg = img.cgImage(forProposedRect: nil, context: nil, hints: nil) else { continue }
  let req = VNRecognizeTextRequest()
  req.recognitionLanguages = ["zh-Hant","zh-Hans"]
  req.recognitionLevel = .accurate
  try? VNImageRequestHandler(cgImage: cg).perform([req])
  let txt = (req.results ?? []).compactMap{$0.topCandidates(1).first?.string}.joined(separator: " ")
  print("\(f)\t\(txt)")
}
