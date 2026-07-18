# User Management Documentation

This document describes the user management system added to the CMS.

## Database Schema

### Users Table

The `users` table stores all CMS users with the following fields:

- **id** - Serial primary key
- **name** - User's full name
- **email** - User's email (unique)
- **password** - Bcrypt hashed password
- **role** - User role: `admin` or `editor`
- **active** - Account status (boolean)
- **createdAt** - Account creation timestamp
- **updatedAt** - Last update timestamp

## Authentication

The system now uses database-backed authentication instead of hardcoded credentials:

- Passwords are hashed using bcrypt with 10 salt rounds
- NextAuth.js v5 handles authentication
- Session includes user role for authorization
- Inactive users cannot login

## User Roles

### Admin
- Full access to all CMS features
- Can manage other users
- Can create, edit, and delete all content

### Editor
- Can manage posts, categories, and tags
- Cannot manage other users
- Full content management access

## Initial Setup

### 1. Seed Admin User

Create the initial admin user by running:

```bash
npm run db:seed
```

This creates an admin user with credentials from your `.env.local`:
- Email: `ADMIN_EMAIL` (default: admin@example.com)
- Password: `ADMIN_PASSWORD` (default: admin123)

### 2. Login

1. Navigate to `/admin/login`
2. Enter admin credentials
3. You'll be redirected to the dashboard

## User Management Interface

Access user management at `/admin/users`

### Features

**Create User**
- Click "Add User" button
- Fill in name, email, password
- Select role (Admin/Editor)
- Set active status
- Submit to create

**Edit User**
- Click "Edit" on any user
- Modify any fields
- Leave password blank to keep current password
- Submit to update

**Delete User**
- Click "Delete" on any user
- Confirm deletion
- User is permanently removed

### User List Columns
- Name
- Email
- Role (with color-coded badge)
- Status (Active/Inactive badge)
- Created date
- Actions (Edit/Delete)

## API Endpoints

### List Users
```
GET /api/users

Response:
{
  "success": true,
  "data": [
    {
      "id": 1,
      "name": "Admin User",
      "email": "admin@example.com",
      "role": "admin",
      "active": true,
      "createdAt": "2026-01-14T...",
      "updatedAt": "2026-01-14T..."
    }
  ]
}
```

Note: Passwords are never returned in API responses.

### Get Single User
```
GET /api/users/[id]

Response:
{
  "success": true,
  "data": { ... }
}
```

### Create User
```
POST /api/users

Body:
{
  "name": "John Doe",
  "email": "john@example.com",
  "password": "securePassword123",
  "role": "editor",
  "active": true
}

Response:
{
  "success": true,
  "data": { ... }
}
```

### Update User
```
PUT /api/users/[id]

Body: (all fields optional)
{
  "name": "Updated Name",
  "email": "newemail@example.com",
  "password": "newPassword123",  // Optional - omit to keep current
  "role": "admin",
  "active": false
}

Response:
{
  "success": true,
  "data": { ... }
}
```

### Delete User
```
DELETE /api/users/[id]

Response:
{
  "success": true,
  "message": "User deleted successfully"
}
```

## Security Features

1. **Password Hashing**
   - All passwords hashed with bcrypt
   - 10 salt rounds for security
   - Passwords never stored in plain text

2. **Validation**
   - Email format validation
   - Password minimum 6 characters
   - Required fields enforced
   - Unique email constraint

3. **Active Status**
   - Inactive users cannot login
   - Can deactivate without deleting

4. **Role-Based Access**
   - JWT tokens include user role
   - Session includes role for client-side checks
   - Extensible for future permissions

## Environment Variables

Required in `.env.local`:

```env
# Database
DATABASE_URL=postgresql://...

# Authentication
AUTH_SECRET=your_random_secret_here
ADMIN_EMAIL=admin@example.com
ADMIN_PASSWORD=admin123
```

Generate AUTH_SECRET with:
```bash
openssl rand -base64 32
```

## Best Practices

1. **Change Default Credentials**
   - Update ADMIN_EMAIL and ADMIN_PASSWORD in production
   - Use strong passwords

2. **User Management**
   - Deactivate users instead of deleting when possible
   - Regularly audit user accounts
   - Use editor role by default

3. **Security**
   - Keep AUTH_SECRET secure
   - Never commit .env.local to git
   - Use HTTPS in production
   - Implement rate limiting for login attempts

## Troubleshooting

**Can't Login**
- Verify user is active in database
- Check credentials match exactly
- Ensure DATABASE_URL is correct
- Check NextAuth.js logs in console

**Seed Script Fails**
- Verify .env.local exists with DATABASE_URL
- Check database connection
- Ensure users table exists (run migrations)

**Password Update Not Working**
- Leave password field blank to keep current
- Password must be 6+ characters
- Check browser console for errors
