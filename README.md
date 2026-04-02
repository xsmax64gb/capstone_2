# ELapp Backend

Backend API cho ứng dụng học tiếng Anh ELapp được xây dựng bằng Express.js và MongoDB.

## 🚀 Tính năng chính

- **Authentication**: JWT-based authentication với đăng ký/đăng nhập
- **Vocabulary Management**: Quản lý bộ từ vựng, flashcards, quiz
- **Exercise System**: Hệ thống bài tập với nhiều dạng (MCQ, Fill-in-blank, Matching)
- **AI Integration**: Tích hợp OpenAI cho học tập và luyện nói
- **File Upload**: Upload hình ảnh qua Cloudinary
- **Email Service**: Gửi email qua SendGrid
- **API Documentation**: Swagger UI documentation
- **Seeding**: Scripts để seed dữ liệu mẫu

## 🛠️ Tech Stack

- **Runtime**: Node.js với ES Modules
- **Framework**: Express.js
- **Database**: MongoDB với Mongoose ODM
- **Authentication**: JSON Web Tokens (JWT)
- **File Storage**: Cloudinary
- **Email**: SendGrid
- **Documentation**: Swagger/OpenAPI
- **Development**: Nodemon

## 📁 Cấu trúc thư mục

```
BE/
├── config/           # Cấu hình database, swagger
├── controllers/      # Logic xử lý API
├── helper/           # Helper functions và utilities
├── middleware/       # Express middleware (auth, upload)
├── models/           # Mongoose models
├── routes/           # API routes
├── scripts/          # Seeding scripts
├── services/         # Business logic services
├── index.js          # Entry point
├── package.json
└── .env              # Environment variables
```

## 🔧 Cài đặt và chạy

### 1. Cài đặt dependencies

```bash
npm install
```

### 2. Cấu hình environment

Tạo file `.env` từ `.env.example`:

```bash
cp .env.example .env
```

Cấu hình các biến môi trường cần thiết:
- `MONGODB_URI`: MongoDB connection string
- `JWT_SECRET`: Secret key cho JWT
- `CLOUDINARY_*`: Cloudinary credentials
- `OPENAI_API_KEY`: OpenAI API key
- `SENDGRID_*`: SendGrid credentials

### 3. Khởi động database

Đảm bảo MongoDB đang chạy (local hoặc Atlas).

### 4. Chạy development server

```bash
npm run dev
```

Server sẽ chạy tại `http://localhost:5000`

### 5. Seed dữ liệu mẫu (tùy chọn)

```bash
# Seed exercises
npm run seed:exercises

# Force reseed exercises
npm run seed:exercises:force

# Seed learn maps
npm run seed:learn
```

## 📚 API Documentation

Truy cập Swagger UI tại: `http://localhost:5000/api-docs`

## 🔗 API Endpoints chính

### Authentication
- `POST /api/auth/register` - Đăng ký
- `POST /api/auth/login` - Đăng nhập
- `GET /api/auth/profile` - Lấy thông tin profile

### Vocabulary
- `GET /api/vocabularies` - Lấy danh sách từ vựng
- `GET /api/vocabularies/recommended` - Từ vựng được đề xuất
- `GET /api/vocabularies/:id` - Chi tiết bộ từ vựng
- `GET /api/vocabularies/:id/flashcards` - Flashcards
- `POST /api/vocabularies/:id/quiz` - Nộp bài quiz

### Exercises
- `GET /api/exercises` - Lấy danh sách bài tập
- `GET /api/exercises/recommended` - Bài tập được đề xuất
- `GET /api/exercises/:id` - Chi tiết bài tập
- `POST /api/exercises/:id/submit` - Nộp bài tập

### AI Features
- `POST /api/ai/chat` - Chat với AI
- `POST /api/learn/conversation` - Học hội thoại
- `POST /api/placement/test` - Bài test định mức

## 🗃️ Database Models

### User
- Thông tin cá nhân, level, progress
- Authentication data

### VocabularySet & Vocabulary
- Bộ từ vựng và các từ trong bộ
- Metadata, difficulty level

### Exercise & ExerciseAttempt
- Bài tập và kết quả làm bài
- Scoring, progress tracking

### AI Sessions
- Lịch sử chat với AI
- Conversation context

## 🔐 Authentication

API sử dụng JWT tokens cho authentication:

1. **Đăng ký/Đăng nhập** để nhận JWT token
2. **Gửi token** trong header: `Authorization: Bearer <token>`
3. **Middleware** tự động attach user info từ token

## 📤 File Upload

Upload hình ảnh thông qua Cloudinary:

- **Endpoint**: `POST /api/upload`
- **Supported formats**: JPG, PNG, GIF
- **Max size**: 5MB
- **Folders**: exercises, avatars, etc.

## 📧 Email Service

Gửi email thông qua SendGrid:

- **OTP verification** cho đăng ký
- **Password reset** (nếu implement)
- **Notifications** (tương lai)

## 🧪 Testing

```bash
# Chạy tests (nếu có)
npm test

# Kiểm tra linting
npm run lint
```

## 🚀 Production Deployment

### Build for production

```bash
npm run build  # Nếu có build step
npm start
```

### Environment Variables cho Production

```env
NODE_ENV=production
PORT=5000
MONGODB_URI=your_production_mongo_uri
JWT_SECRET=your_secure_jwt_secret
CLOUDINARY_CLOUD_NAME=your_cloud_name
CLOUDINARY_API_KEY=your_api_key
CLOUDINARY_API_SECRET=your_api_secret
OPENAI_API_KEY=your_openai_key
SENDGRID_API_KEY=your_sendgrid_key
```

## 🤝 Contributing

1. Fork repository
2. Tạo feature branch: `git checkout -b feature/new-feature`
3. Commit changes: `git commit -am 'Add new feature'`
4. Push to branch: `git push origin feature/new-feature`
5. Tạo Pull Request

## 📝 License

ISC License

## 📞 Support

Nếu có vấn đề, hãy tạo issue trên GitHub hoặc liên hệ team development.