import { execFile } from 'child_process';
import { promisify } from 'util';
import fs from 'fs/promises';
import path from 'path';
import os from 'os';

const execFileAsync = promisify(execFile);

const SWIFT_OCR_SCRIPT = `
import Foundation
import Vision
import AppKit

let args = CommandLine.arguments
guard args.count > 1 else { exit(1) }
let imagePath = args[1]

guard let image = NSImage(contentsOfFile: imagePath),
      let cgImage = image.cgImage(forProposedRect: nil, context: nil, hints: nil) else {
    fputs("Failed to load image\\n", stderr)
    exit(1)
}

let request = VNRecognizeTextRequest()
request.recognitionLevel = .accurate
request.usesLanguageCorrection = true

let handler = VNImageRequestHandler(cgImage: cgImage, options: [:])
try handler.perform([request])

guard let observations = request.results else { exit(0) }

struct TextBox {
    let text: String
    let x: Double
    let y: Double // Vision y is 0 at bottom, 1 at top
}

var boxes: [TextBox] = []
for obs in observations {
    if let candidate = obs.topCandidates(1).first {
        let box = obs.boundingBox
        boxes.append(TextBox(text: candidate.string, x: Double(box.origin.x), y: Double(box.midY)))
    }
}

// Sort top-to-bottom (descending Y)
boxes.sort { $0.y > $1.y }

// Group into horizontal lines when Y is within 0.018 of each other
var lines: [[TextBox]] = []
for box in boxes {
    if var lastLine = lines.last, let firstInLine = lastLine.first, abs(firstInLine.y - box.y) < 0.018 {
        lastLine.append(box)
        lines[lines.count - 1] = lastLine
    } else {
        lines.append([box])
    }
}

for line in lines {
    let sortedLine = line.sorted { $0.x < $1.x }
    let joined = sortedLine.map { $0.text }.joined(separator: "   ")
    print(joined)
}
`;

/**
 * Uses macOS native Apple Vision Framework (VNRecognizeTextRequest) to perform
 * spatial row-preserving OCR on a screenshot without requiring external API keys.
 */
export async function runLocalMacOSVisionOCR(imageBuffer: Buffer, ext: string = '.png'): Promise<string> {
  const tmpDir = os.tmpdir();
  const stamp = `${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
  const imgPath = path.join(tmpDir, `budget_ocr_${stamp}${ext}`);
  const swiftPath = path.join(tmpDir, `budget_ocr_${stamp}.swift`);

  try {
    await fs.writeFile(imgPath, imageBuffer);
    await fs.writeFile(swiftPath, SWIFT_OCR_SCRIPT, 'utf-8');

    const { stdout } = await execFileAsync('swift', [swiftPath, imgPath], {
      timeout: 25000,
    });
    return stdout;
  } finally {
    await fs.unlink(imgPath).catch(() => {});
    await fs.unlink(swiftPath).catch(() => {});
  }
}

