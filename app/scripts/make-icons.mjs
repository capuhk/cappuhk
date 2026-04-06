// 로고 이미지를 크롭·리사이즈하여 PWA 아이콘 생성
import { Jimp } from 'jimp'
import { join, dirname } from 'path'
import { fileURLToPath } from 'url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const publicDir = join(__dirname, '..', 'public')

async function main() {
  const img = await Jimp.read(join(publicDir, 'logo-original.png.png'))
  const { width, height } = img.bitmap

  console.log(`원본 크기: ${width}x${height}`)

  // ─── 흰 여백 자동 감지 (비흰색 픽셀 경계 탐색) ───
  let minX = width, maxX = 0, minY = height, maxY = 0

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const idx = (y * width + x) * 4
      const r = img.bitmap.data[idx]
      const g = img.bitmap.data[idx + 1]
      const b = img.bitmap.data[idx + 2]
      const a = img.bitmap.data[idx + 3]
      // 흰색(RGB>=240) 또는 투명 픽셀은 배경으로 간주
      const isBackground = a < 10 || (r >= 240 && g >= 240 && b >= 240)
      if (!isBackground) {
        if (x < minX) minX = x
        if (x > maxX) maxX = x
        if (y < minY) minY = y
        if (y > maxY) maxY = y
      }
    }
  }

  console.log(`콘텐츠 경계: (${minX},${minY}) ~ (${maxX},${maxY})`)

  // 소폭 패딩 추가 (원본 크기 대비 2%)
  const pad = Math.floor(width * 0.02)
  const cropX = Math.max(0, minX - pad)
  const cropY = Math.max(0, minY - pad)
  const cropW = Math.min(width - cropX, maxX - cropX + pad + 1)
  const cropH = Math.min(height - cropY, maxY - cropY + pad + 1)

  console.log(`크롭 영역: x=${cropX}, y=${cropY}, w=${cropW}, h=${cropH}`)

  // 크롭된 이미지 (정사각형으로 만들기)
  const side = Math.max(cropW, cropH)
  const offsetX = Math.floor((side - cropW) / 2)
  const offsetY = Math.floor((side - cropH) / 2)

  // ─── 각 크기별 아이콘 생성 ───
  const sizes = [
    { name: 'pwa-192x192.png', size: 192 },
    { name: 'pwa-512x512.png', size: 512 },
    { name: 'apple-touch-icon.png', size: 180 },
  ]

  for (const { name, size } of sizes) {
    // 흰 배경 캔버스 생성
    const canvas = new Jimp({ width: side, height: side, color: 0xFFFFFFFF })

    // 크롭된 영역을 캔버스에 복사
    const cropped = img.clone()
      .crop({ x: cropX, y: cropY, w: cropW, h: cropH })

    canvas.composite(cropped, offsetX, offsetY)

    // 목표 크기로 리사이즈
    canvas.resize({ w: size, h: size })

    await canvas.write(join(publicDir, name))
    console.log(`✓ ${name} (${size}x${size}) 저장됨`)
  }

  // ─── favicon.svg — 원본 PNG를 SVG로 감싸기 ───
  // 크롭된 PNG를 64px로 리사이즈해 base64 임베드
  const faviconCanvas = new Jimp({ width: side, height: side, color: 0xFFFFFFFF })
  const croppedForFavicon = img.clone()
    .crop({ x: cropX, y: cropY, w: cropW, h: cropH })
  faviconCanvas.composite(croppedForFavicon, offsetX, offsetY)
  faviconCanvas.resize({ w: 64, h: 64 })

  const faviconBase64 = await faviconCanvas.getBase64('image/png')

  const svgContent = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64">
  <image href="${faviconBase64}" width="64" height="64"/>
</svg>`

  import('fs').then(({ writeFileSync }) => {
    writeFileSync(join(publicDir, 'favicon.svg'), svgContent)
    console.log('✓ favicon.svg 저장됨')
  })
}

main().catch(console.error)
