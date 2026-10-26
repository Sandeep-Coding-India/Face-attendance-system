# FaceAttend Frontend - Step 6

Step 6 connects the HR workspace to the existing backend employee and face-registration APIs. No backend files are changed.

## HR features

- Load company employees from `GET /employees/`
- Create employee with `POST /employees/`
- Edit employee with `PUT /employees/{id}` using the existing backend query-parameter contract
- Delete employee with `DELETE /employees/{id}`
- Search employees
- Face registration workflow:
  - `POST /faces/start/{employee_id}`
  - `POST /faces/sample/{employee_id}` with multipart `file`
  - `POST /faces/finalize/{employee_id}`
- Camera capture uses browser `getUserMedia()`.
- Minimum 5 samples are required before finalization. The backend can request 10 samples.
- The UI also tries the singular `/face/...` route as a fallback for the alternate face router used in earlier backend versions.
- JWT is automatically attached to JSON and multipart requests.

## Run

```cmd
npm install
npm run dev
```

Keep the backend running at `http://127.0.0.1:8000` unless `VITE_API_BASE_URL` is configured.
