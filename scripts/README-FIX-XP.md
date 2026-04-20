# Fix User Level & XP Issues

## Vấn đề

User có XP âm hoặc hiển thị XP âm trên UI do:

1. **UserLevel.currentLevel không sync với User.exp**: Khi user có 40 XP nhưng UserLevel.currentLevel = 2 (A2), thì currentLevelThreshold = 2000, dẫn đến hiển thị âm.
2. **Thiếu validation**: Không có validation đầy đủ để ngăn XP âm.

## Giải pháp đã implement

### 1. Auto-fix trong runtime
- `level-manager.service.js`: Tự động recalculate và fix currentLevel từ totalXp mỗi khi gọi `getUserLevelInfo()` hoặc `checkLevelUpEligibility()`
- Thêm validation trong tất cả nơi `$inc` XP để đảm bảo chỉ increment với số dương

### 2. Validation trong User model
- Thêm validator để đảm bảo exp >= 0
- Thêm pre-save hook để tự động set exp = 0 nếu âm

### 3. Safe XP increment
- Tất cả các nơi `$inc` XP đều dùng `Math.max(0, Math.floor(xp))` để đảm bảo an toàn
- Files đã fix:
  - `BE/helper/xp-level-integration.js`
  - `BE/controllers/vocabulary.controller.js`
  - `BE/controllers/exercise.controller.js`
  - `BE/services/learn-conversation.service.js`
  - `BE/services/learn-achievement.service.js`

## Chạy migration để fix dữ liệu hiện tại

```bash
cd BE
node scripts/fix-user-level-mismatch.js
```

Script này sẽ:
1. Kiểm tra tất cả users
2. Tính toán lại currentLevel từ totalXp
3. Fix các UserLevel records có currentLevel sai
4. Tạo UserLevel cho users chưa có
5. Hiển thị summary: số records đã fix, đã đúng, và lỗi

## Kiểm tra sau khi fix

1. Restart backend server
2. Login vào app
3. Kiểm tra profile page - XP và progress bar phải hiển thị đúng
4. Làm bài tập/vocabulary để kiếm XP - XP phải tăng đúng
5. Kiểm tra level progress bar không hiển thị số âm

## Level thresholds

```
Level 1 (A1): 0 - 499 XP
Level 2 (A2): 500 - 1999 XP
Level 3 (B1): 2000 - 4499 XP
Level 4 (B2): 4500 - 7999 XP
Level 5 (C1): 8000 - 12499 XP
Level 6 (C2): 12500+ XP
```

Formula: `threshold = level² × 500`

## Logs

Khi có mismatch, server sẽ log:
```
[Level Manager] Fixing level mismatch for user <userId>: stored=2, calculated=1, xp=40
```

Điều này là bình thường và sẽ tự động fix.
