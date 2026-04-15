import { useState } from 'react'
import { Link } from 'react-router-dom'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { cn, formatDate } from '@/lib/utils'
import { ArrowLeft, Plus, Pencil, UserX, ChevronUp, UserPlus } from 'lucide-react'

type UserRole = 'ADMIN' | 'MONITORING_ENGINEER' | 'NOC_OPERATOR' | 'MANAGER' | 'READONLY'

interface MockUser {
  id: string
  firstName: string
  lastName: string
  email: string
  role: UserRole
  isActive: boolean
  lastLoginAt: string | null
}

const ROLE_COLORS: Record<UserRole, string> = {
  ADMIN: 'bg-primary/20 text-primary',
  MONITORING_ENGINEER: 'bg-blue-500/20 text-blue-400',
  NOC_OPERATOR: 'bg-amber-500/20 text-amber-400',
  MANAGER: 'bg-purple-500/20 text-purple-400',
  READONLY: 'bg-gray-500/20 text-gray-400',
}

const ROLE_LABELS: Record<UserRole, string> = {
  ADMIN: 'Admin',
  MONITORING_ENGINEER: 'Engineer',
  NOC_OPERATOR: 'NOC Operator',
  MANAGER: 'Manager',
  READONLY: 'Read Only',
}

const ALL_ROLES: UserRole[] = ['ADMIN', 'MONITORING_ENGINEER', 'NOC_OPERATOR', 'MANAGER', 'READONLY']

const INITIAL_USERS: MockUser[] = [
  { id: '1', firstName: 'Admin', lastName: 'User', email: 'admin@company.com', role: 'ADMIN', isActive: true, lastLoginAt: new Date().toISOString() },
  { id: '2', firstName: 'John', lastName: 'Engineer', email: 'john@company.com', role: 'MONITORING_ENGINEER', isActive: true, lastLoginAt: new Date(Date.now() - 7200000).toISOString() },
  { id: '3', firstName: 'Sarah', lastName: 'Operator', email: 'sarah@company.com', role: 'NOC_OPERATOR', isActive: true, lastLoginAt: new Date(Date.now() - 3600000).toISOString() },
  { id: '4', firstName: 'Mike', lastName: 'Manager', email: 'mike@company.com', role: 'MANAGER', isActive: true, lastLoginAt: new Date(Date.now() - 86400000).toISOString() },
  { id: '5', firstName: 'Jane', lastName: 'Viewer', email: 'jane@company.com', role: 'READONLY', isActive: false, lastLoginAt: null },
]

export default function UsersPage() {
  const [users, setUsers] = useState(INITIAL_USERS)
  const [showForm, setShowForm] = useState(false)
  const [formEmail, setFormEmail] = useState('')
  const [formFirstName, setFormFirstName] = useState('')
  const [formLastName, setFormLastName] = useState('')
  const [formPassword, setFormPassword] = useState('')
  const [formRole, setFormRole] = useState<UserRole>('NOC_OPERATOR')

  function handleAddUser() {
    if (!formEmail || !formFirstName || !formLastName || !formPassword) return
    const newUser: MockUser = {
      id: String(Date.now()),
      firstName: formFirstName,
      lastName: formLastName,
      email: formEmail,
      role: formRole,
      isActive: true,
      lastLoginAt: null,
    }
    setUsers((prev) => [newUser, ...prev])
    setFormEmail('')
    setFormFirstName('')
    setFormLastName('')
    setFormPassword('')
    setFormRole('NOC_OPERATOR')
    setShowForm(false)
  }

  function handleToggleActive(userId: string) {
    setUsers((prev) =>
      prev.map((u) =>
        u.id === userId ? { ...u, isActive: !u.isActive } : u
      )
    )
  }

  return (
    <div className="space-y-6 p-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Link to="/settings">
            <Button variant="ghost" size="icon">
              <ArrowLeft className="h-5 w-5" />
            </Button>
          </Link>
          <div>
            <h1 className="text-2xl font-bold text-white">Users</h1>
            <p className="mt-0.5 text-sm text-gray-400">
              Manage user accounts and role assignments
            </p>
          </div>
        </div>
        <Button onClick={() => setShowForm(!showForm)}>
          {showForm ? (
            <>
              <ChevronUp className="mr-2 h-4 w-4" />
              Cancel
            </>
          ) : (
            <>
              <Plus className="mr-2 h-4 w-4" />
              Add User
            </>
          )}
        </Button>
      </div>

      {/* Add user form */}
      {showForm && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <UserPlus className="h-5 w-5 text-primary" />
              New User
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-5">
              <div>
                <label className="mb-1.5 block text-sm font-medium text-gray-300">
                  First Name
                </label>
                <Input
                  placeholder="First name"
                  value={formFirstName}
                  onChange={(e) => setFormFirstName(e.target.value)}
                />
              </div>
              <div>
                <label className="mb-1.5 block text-sm font-medium text-gray-300">
                  Last Name
                </label>
                <Input
                  placeholder="Last name"
                  value={formLastName}
                  onChange={(e) => setFormLastName(e.target.value)}
                />
              </div>
              <div>
                <label className="mb-1.5 block text-sm font-medium text-gray-300">
                  Email
                </label>
                <Input
                  type="email"
                  placeholder="user@company.com"
                  value={formEmail}
                  onChange={(e) => setFormEmail(e.target.value)}
                />
              </div>
              <div>
                <label className="mb-1.5 block text-sm font-medium text-gray-300">
                  Password
                </label>
                <Input
                  type="password"
                  placeholder="Min 8 characters"
                  value={formPassword}
                  onChange={(e) => setFormPassword(e.target.value)}
                />
              </div>
              <div>
                <label className="mb-1.5 block text-sm font-medium text-gray-300">
                  Role
                </label>
                <select
                  value={formRole}
                  onChange={(e) => setFormRole(e.target.value as UserRole)}
                  className="h-10 w-full rounded-md border border-gray-600 bg-brand-surface px-3 text-sm text-gray-100 focus:outline-none focus:ring-2 focus:ring-primary"
                >
                  {ALL_ROLES.map((role) => (
                    <option key={role} value={role}>
                      {ROLE_LABELS[role]}
                    </option>
                  ))}
                </select>
              </div>
            </div>
            <div className="mt-4 flex justify-end">
              <Button
                onClick={handleAddUser}
                disabled={!formEmail || !formFirstName || !formLastName || !formPassword}
              >
                Create User
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Users table */}
      <Card>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Name</TableHead>
              <TableHead>Email</TableHead>
              <TableHead>Role</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Last Login</TableHead>
              <TableHead className="text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {users.map((user) => (
              <TableRow key={user.id}>
                <TableCell className="font-medium text-gray-100">
                  {user.firstName} {user.lastName}
                </TableCell>
                <TableCell className="font-mono text-xs text-gray-400">
                  {user.email}
                </TableCell>
                <TableCell>
                  <span className={cn(
                    'inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium',
                    ROLE_COLORS[user.role]
                  )}>
                    {ROLE_LABELS[user.role]}
                  </span>
                </TableCell>
                <TableCell>
                  <Badge variant={user.isActive ? 'success' : 'default'}>
                    {user.isActive ? 'Active' : 'Inactive'}
                  </Badge>
                </TableCell>
                <TableCell className="font-mono text-xs text-gray-400">
                  {user.lastLoginAt ? formatDate(user.lastLoginAt) : 'Never'}
                </TableCell>
                <TableCell className="text-right">
                  <div className="flex items-center justify-end gap-1">
                    <Button variant="ghost" size="sm">
                      <Pencil className="mr-1.5 h-3.5 w-3.5" />
                      Edit
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      className={cn(
                        user.isActive
                          ? 'text-red-400 hover:text-red-300'
                          : 'text-green-400 hover:text-green-300'
                      )}
                      onClick={() => handleToggleActive(user.id)}
                    >
                      <UserX className="mr-1.5 h-3.5 w-3.5" />
                      {user.isActive ? 'Deactivate' : 'Activate'}
                    </Button>
                  </div>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </Card>
    </div>
  )
}
