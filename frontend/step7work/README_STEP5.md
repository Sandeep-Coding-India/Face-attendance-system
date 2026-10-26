# FaceAttend Frontend - Step 5

Step 5 adds the Admin staff-management flow without changing the backend.

## What is connected

- `POST /company/register` for company + Admin registration
- `POST /auth/login` for Admin / HR / Manager login
- `POST /users/staff` for Admin-only HR / Manager creation
- `GET /attendance/dashboard` for live dashboard numbers
- JWT is automatically sent as `Authorization: Bearer <token>`

## Staff creation flow

Admin signs in -> Admin Dashboard -> `Create HR / Manager`

The form sends:

```json
{
  "full_name": "Rahul Sharma",
  "email": "hr@company.com",
  "role": "hr",
  "password": "********"
}
```

or:

```json
{
  "full_name": "Amit Verma",
  "email": "manager@company.com",
  "role": "manager",
  "password": "********"
}
```

The backend generates the unique company-scoped Login ID (`HR-XXXXXXXX` or `MGR-XXXXXXXX`) and returns it. The frontend displays the generated ID to the Admin.

## Run

From the `frontend` folder:

```bash
npm install
npm run dev
```

Backend must be running at:

`http://127.0.0.1:8000`

If your backend uses another URL, create `.env`:

```env
VITE_API_BASE_URL=http://127.0.0.1:8000
```
