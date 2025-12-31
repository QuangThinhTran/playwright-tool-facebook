# Facebook Auto-Post Bot 🤖

Tự động đăng bài lên nhiều nhóm Facebook cùng lúc với Playwright.

## Yêu cầu

- Node.js v22.19.0 trở lên

## Cài đặt

```bash
npm install
```

## Cấu hình

### 1. Cookie (config/authen.json)
Chứa cookies để đăng nhập Facebook tự động.

### 2. Nhóm Facebook (config/config.json)
Danh sách ID hoặc slug của các nhóm cần đăng bài:
```json
{
  "groups": [
    "184341856859301",
    "tanbinh.tanphu.phongtrogiare"
  ]
}
```

### 3. Nội dung bài đăng (config/prompt.md)
Nội dung text sẽ được đăng lên tất cả các nhóm.

### 4. Ảnh/Video (images/)
Tất cả các file `.jpg` và `.mp4` trong thư mục `images/` (bao gồm cả thư mục con) sẽ được tự động upload.

## Chạy chương trình

```bash
npm start
```

hoặc

```bash
node fb-post.js
```

## Tính năng

✅ Tự động đăng bài lên nhiều nhóm
✅ Upload ảnh và video
✅ Chế độ headful (có giao diện) để debug
✅ Tự động chụp màn hình làm evidence
✅ Xử lý lỗi cho từng nhóm riêng biệt

## Evidence

Screenshot của mỗi bài đăng được lưu với tên:
```
evidence-group-{groupId}-{timestamp}.png
```

## Lưu ý

- Browser sẽ tự động đóng sau 5 phút
- Nhấn Ctrl+C để đóng browser ngay lập tức
- Evidence screenshots được lưu tại thư mục gốc
