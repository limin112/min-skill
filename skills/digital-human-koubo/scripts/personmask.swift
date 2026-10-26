// personmask <W> <H> [person|subject|auto] — 逐帧主体分割
//   stdin : BGRA 原始帧流(W×H×4 字节/帧,由 ffmpeg 解码喂入)
//   stdout: 灰度 mask 原始字节流(R8, W×H 字节/帧),与输入帧一一对应
//   person  : VNGeneratePersonSegmentationRequest,只认人
//   subject : VNGenerateForegroundInstanceMaskRequest(系统「抠主体」同款),动物/物体/人都认
//   auto    : 两者取并集(默认) — 人像边缘精细 + 动物/物体也不丢
// 解码交给 ffmpeg:AVAssetReader 遇到 AV1(M1/M2 无硬解)会静默出 0 帧,
// 遇到 VFR 又会和 ffmpeg 的帧序列错位 — 两条流用同一解码器就天然对齐。
// 编译(whitemodel.py 首次运行会自动做): swiftc -O -swift-version 5 personmask.swift -o ../bin/personmask

import Foundation
import Vision
import CoreImage
import CoreVideo

let args = CommandLine.arguments
guard args.count >= 3, let W = Int(args[1]), let H = Int(args[2]), W > 0, H > 0 else {
    FileHandle.standardError.write("usage: personmask <W> <H> [person|subject|auto] < bgra\n".data(using: .utf8)!)
    exit(2)
}
let mode = args.count >= 4 ? args[3] : "auto"
let usePerson = mode != "subject"
let useSubject = mode != "person"

let personReq = VNGeneratePersonSegmentationRequest()
personReq.qualityLevel = .accurate   // 打斗等快速多人场景 balanced 会丢人
personReq.outputPixelFormat = kCVPixelFormatType_OneComponent8
let subjectReq = VNGenerateForegroundInstanceMaskRequest()

let ctx = CIContext(options: [.workingColorSpace: NSNull()])
let stdin = FileHandle.standardInput
let stdout = FileHandle.standardOutput
let frameBytes = W * H * 4
var buf = [UInt8](repeating: 0, count: W * H)
var tmp = [UInt8](repeating: 0, count: W * H)
var frames = 0

var pbOpt: CVPixelBuffer?
CVPixelBufferCreate(nil, W, H, kCVPixelFormatType_32BGRA,
                    [kCVPixelBufferIOSurfacePropertiesKey: [:]] as CFDictionary, &pbOpt)
guard let pb = pbOpt else {
    FileHandle.standardError.write("CVPixelBufferCreate failed\n".data(using: .utf8)!)
    exit(1)
}

func readFrame() -> Data? {
    var data = Data(capacity: frameBytes)
    while data.count < frameBytes {
        let chunk = stdin.readData(ofLength: frameBytes - data.count)
        if chunk.isEmpty { return nil }
        data.append(chunk)
    }
    return data
}

// 任意尺寸的单通道 mask → 缩放到帧尺寸写进 dst
func renderMask(_ mask: CVPixelBuffer, into dst: inout [UInt8]) {
    let ci = CIImage(cvPixelBuffer: mask)
    let sx = CGFloat(W) / ci.extent.width
    let sy = CGFloat(H) / ci.extent.height
    let scaled = ci.transformed(by: CGAffineTransform(scaleX: sx, y: sy))
    ctx.render(scaled, toBitmap: &dst, rowBytes: W,
               bounds: CGRect(x: 0, y: 0, width: W, height: H),
               format: .R8, colorSpace: nil)
}

while let frame = readFrame() {
    // 原始 BGRA 逐行拷进 CVPixelBuffer(其行宽可能有对齐填充)
    CVPixelBufferLockBaseAddress(pb, [])
    let base = CVPixelBufferGetBaseAddress(pb)!
    let rowBytes = CVPixelBufferGetBytesPerRow(pb)
    frame.withUnsafeBytes { (src: UnsafeRawBufferPointer) in
        for y in 0..<H {
            memcpy(base + y * rowBytes, src.baseAddress! + y * W * 4, W * 4)
        }
    }
    CVPixelBufferUnlockBaseAddress(pb, [])

    for i in 0..<buf.count { buf[i] = 0 }
    let handler = VNImageRequestHandler(cvPixelBuffer: pb, options: [:])
    var reqs: [VNRequest] = []
    if usePerson { reqs.append(personReq) }
    if useSubject { reqs.append(subjectReq) }
    if (try? handler.perform(reqs)) != nil {
        if usePerson, let m = personReq.results?.first?.pixelBuffer {
            renderMask(m, into: &buf)
        }
        if useSubject, let obs = subjectReq.results?.first, !obs.allInstances.isEmpty,
           let m = try? obs.generateScaledMaskForImage(forInstances: obs.allInstances, from: handler) {
            // 前景 mask 是 OneComponent32Float,CI 渲染成 R8 后与人像取 max
            renderMask(m, into: &tmp)
            if usePerson {
                for i in 0..<buf.count where tmp[i] > buf[i] { buf[i] = tmp[i] }
            } else {
                swap(&buf, &tmp)
            }
        }
    }
    stdout.write(Data(bytes: buf, count: W * H))
    frames += 1
}
FileHandle.standardError.write("frames=\(frames)\n".data(using: .utf8)!)
