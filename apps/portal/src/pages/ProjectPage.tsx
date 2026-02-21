import { useState, useEffect } from 'react';
import { useParams, Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../hooks/useAuth';

const API_URL = 'https://online.siteaccess.ru';

interface Project {
  id: string;
  name: string;
  allowedDomains: string[] | null;
  widgetSettings: any;
  installVerifiedAt: string | null;
  lastWidgetPingAt: string | null;
  createdAt: string;
  updatedAt: string;
}

interface Member {
  userId: string;
  email: string;
  role: string;
  createdAt: string;
}

export default function ProjectPage() {
  const { id } = useParams<{ id: string }>();
  const { user } = useAuth();
  const navigate = useNavigate();
  const [project, setProject] = useState<Project | null>(null);
  const [members, setMembers] = useState<Member[]>([]);
  const [loading, setLoading] = useState(true);
  const [showInviteForm, setShowInviteForm] = useState(false);
  const [inviteEmail, setInviteEmail] = useState('');
  const [inviting, setInviting] = useState(false);
  const [removing, setRemoving] = useState<string | null>(null);

  useEffect(() => {
    if (id) {
      loadProject();
      loadMembers();
    }
  }, [id]);

  const loadProject = async () => {
    try {
      const token = localStorage.getItem('accessToken');
      const response = await fetch(`${API_URL}/api/projects/${id}`, {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });

      if (response.ok) {
        const data = await response.json();
        setProject(data);
      }
    } catch (err) {
      console.error('Failed to load project', err);
    } finally {
      setLoading(false);
    }
  };

  const loadMembers = async () => {
    try {
      const token = localStorage.getItem('accessToken');
      const response = await fetch(`${API_URL}/api/projects/${id}/operators`, {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });

      if (response.ok) {
        const data = await response.json();
        setMembers(data);
      }
    } catch (err) {
      console.error('Failed to load members', err);
    }
  };

  const handleInviteOperator = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!inviteEmail.trim()) return;

    setInviting(true);
    try {
      const token = localStorage.getItem('accessToken');
      const response = await fetch(`${API_URL}/api/projects/${id}/operators`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ email: inviteEmail.trim() }),
      });

      if (response.ok) {
        const data = await response.json();
        setInviteEmail('');
        setShowInviteForm(false);
        await loadMembers();
        if (data.tempPassword) {
          alert(`Operator invited! Temporary password: ${data.tempPassword}`);
        } else {
          alert('Operator invited!');
        }
      } else {
        const error = await response.json();
        alert(error.message || 'Failed to invite operator');
      }
    } catch (err) {
      console.error('Failed to invite operator', err);
      alert('Failed to invite operator');
    } finally {
      setInviting(false);
    }
  };

  const handleRemoveOperator = async (userId: string) => {
    if (!confirm('Are you sure you want to remove this operator?')) {
      return;
    }

    setRemoving(userId);
    try {
      const token = localStorage.getItem('accessToken');
      const response = await fetch(`${API_URL}/api/projects/${id}/operators/${userId}`, {
        method: 'DELETE',
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });

      if (response.ok) {
        await loadMembers();
      } else {
        alert('Failed to remove operator');
      }
    } catch (err) {
      console.error('Failed to remove operator', err);
      alert('Failed to remove operator');
    } finally {
      setRemoving(null);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-lg">Loading...</div>
      </div>
    );
  }

  if (!project) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-lg text-red-600">Project not found</div>
      </div>
    );
  }

  const isOwner = members.some((m) => m.userId === user?.id && m.role === 'owner');

  return (
    <div className="min-h-screen bg-gray-50">
      <nav className="bg-white shadow-sm">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between h-16">
            <div className="flex items-center">
              <Link to="/app" className="text-xl font-bold text-indigo-600">
                SiteAccess Dashboard
              </Link>
            </div>
            <div className="flex items-center space-x-4">
              <Link
                to="/operator/"
                target="_blank"
                className="text-gray-700 hover:text-indigo-600 px-3 py-2 rounded-md text-sm font-medium"
              >
                Open Operator Panel
              </Link>
            </div>
          </div>
        </div>
      </nav>

      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="mb-6">
          <button
            onClick={() => navigate('/app')}
            className="text-indigo-600 hover:text-indigo-800 mb-4"
          >
            ← Back to Projects
          </button>
          <h1 className="text-3xl font-bold text-gray-900">{project.name}</h1>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Project Info */}
          <div className="bg-white rounded-lg shadow-md p-6">
            <h2 className="text-xl font-semibold mb-4">Project Information</h2>
            <div className="space-y-3">
              <div>
                <span className="text-sm font-medium text-gray-500">Created:</span>
                <span className="ml-2 text-gray-900">
                  {new Date(project.createdAt).toLocaleString()}
                </span>
              </div>
              {project.allowedDomains && project.allowedDomains.length > 0 && (
                <div>
                  <span className="text-sm font-medium text-gray-500">Allowed Domains:</span>
                  <div className="mt-1">
                    {project.allowedDomains.map((domain, idx) => (
                      <span
                        key={idx}
                        className="inline-block bg-gray-100 text-gray-800 px-2 py-1 rounded text-sm mr-2 mb-2"
                      >
                        {domain}
                      </span>
                    ))}
                  </div>
                </div>
              )}
            </div>
            <div className="mt-6">
              <Link
                to={`/app/project/${id}/install`}
                className="bg-indigo-600 text-white px-4 py-2 rounded hover:bg-indigo-700 inline-block"
              >
                Install Widget
              </Link>
            </div>
          </div>

          {/* Members */}
          <div className="bg-white rounded-lg shadow-md p-6">
            <div className="flex justify-between items-center mb-4">
              <h2 className="text-xl font-semibold">Members</h2>
              {isOwner && (
                <button
                  onClick={() => setShowInviteForm(!showInviteForm)}
                  className="bg-indigo-600 text-white px-4 py-2 rounded text-sm hover:bg-indigo-700"
                >
                  + Invite Operator
                </button>
              )}
            </div>

            {showInviteForm && isOwner && (
              <form onSubmit={handleInviteOperator} className="mb-4 p-4 bg-gray-50 rounded">
                <div className="mb-3">
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Operator Email
                  </label>
                  <input
                    type="email"
                    required
                    className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-indigo-500"
                    value={inviteEmail}
                    onChange={(e) => setInviteEmail(e.target.value)}
                    placeholder="operator@example.com"
                  />
                </div>
                <div className="flex space-x-2">
                  <button
                    type="submit"
                    disabled={inviting}
                    className="bg-indigo-600 text-white px-4 py-2 rounded text-sm hover:bg-indigo-700 disabled:opacity-50"
                  >
                    {inviting ? 'Inviting...' : 'Invite'}
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setShowInviteForm(false);
                      setInviteEmail('');
                    }}
                    className="bg-gray-200 text-gray-700 px-4 py-2 rounded text-sm hover:bg-gray-300"
                  >
                    Cancel
                  </button>
                </div>
              </form>
            )}

            {members.length === 0 ? (
              <p className="text-gray-500 text-sm">No members yet.</p>
            ) : (
              <div className="space-y-2">
                {members.map((member) => (
                  <div
                    key={member.userId}
                    className="flex justify-between items-center p-3 bg-gray-50 rounded"
                  >
                    <div>
                      <div className="font-medium text-gray-900">{member.email}</div>
                      <div className="text-sm text-gray-500">
                        {member.role === 'owner' ? 'Owner' : 'Operator'} • Joined{' '}
                        {new Date(member.createdAt).toLocaleDateString()}
                      </div>
                    </div>
                    {isOwner && member.role !== 'owner' && (
                      <button
                        onClick={() => handleRemoveOperator(member.userId)}
                        disabled={removing === member.userId}
                        className="text-red-600 hover:text-red-800 text-sm disabled:opacity-50"
                      >
                        {removing === member.userId ? 'Removing...' : 'Remove'}
                      </button>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </main>
    </div>
  );
}
