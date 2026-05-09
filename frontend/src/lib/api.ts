import axios from 'axios';

const BASE_URL = process.env.NEXT_PUBLIC_API_BASE_URL || 'http://localhost:5001';

export const api = axios.create({
    baseURL: BASE_URL,
    withCredentials: true,
    headers: { 'Content-Type': 'application/json' },
});

api.interceptors.response.use(
    (res) => res,
    async (error) => {
        if (error.response?.status === 401 && !error.config._retry) {
            error.config._retry = true;
            try {
                await api.post('/api/v1/auth/refresh-token');
                return api(error.config);
            } catch {
                if (typeof window !== 'undefined') window.location.href = '/login';
            }
        }
        return Promise.reject(error);
    },
);

// ── Auth ──────────────────────────────────────────────────────────────────

export const authApi = {
    register: (data: { name: string; email: string; password: string }) =>
        api.post('/api/v1/auth/register', data),
    verify: (token: string, otp: string) =>
        api.post('/api/v1/auth/verify', { token, otp }),
    login: (email: string, password: string) =>
        api.post('/api/v1/auth/login', { email, password }),
    logout: () => api.get('/api/v1/auth/logout'),
    me: () => api.get('/api/v1/auth/me'),
};

// ── Courses ───────────────────────────────────────────────────────────────

export const coursesApi = {
    list: (params?: Record<string, any>) => api.get('/api/v1/courses', { params }),
    featured: () => api.get('/api/v1/courses/featured'),
    getById: (id: string) => api.get(`/api/v1/courses/${id}`),
    getBySlug: (slug: string) => api.get(`/api/v1/courses/slug/${slug}`),
    create: (data: any) => api.post('/api/v1/courses', data),
    update: (id: string, data: any) => api.patch(`/api/v1/courses/${id}`, data),
    submitReview: (id: string) => api.post(`/api/v1/courses/${id}/submit-review`),
    deleteDraft: (id: string) => api.delete(`/api/v1/courses/${id}`),
    myCourses: () => api.get('/api/v1/courses/instructor/my-courses'),
};

// ── Categories ────────────────────────────────────────────────────────────

export const categoriesApi = {
    list: () => api.get('/api/v1/categories'),
};

// ── Enrollment ────────────────────────────────────────────────────────────

export const enrollmentApi = {
    enrollFree: (courseId: string) => api.post(`/api/v1/enrollments/free/${courseId}`),
    myEnrollments: () => api.get('/api/v1/enrollments/my'),
    detail: (courseId: string) => api.get(`/api/v1/enrollments/${courseId}`),
    progress: (courseId: string) => api.get(`/api/v1/enrollments/${courseId}/progress`),
    markComplete: (courseId: string, lessonId: string) =>
        api.post(`/api/v1/enrollments/${courseId}/complete-lesson`, { lessonId }),
    savePosition: (courseId: string, lessonId: string, watchedSeconds: number) =>
        api.post(`/api/v1/enrollments/${courseId}/watch-position`, { lessonId, watchedSeconds }),
};

// ── Orders ────────────────────────────────────────────────────────────────

export const ordersApi = {
    checkout: (courseId: string, couponCode?: string) =>
        api.post('/api/v1/orders/checkout', { courseId, couponCode }),
    validateCoupon: (code: string, courseId: string) =>
        api.post('/api/v1/orders/validate-coupon', { code, courseId }),
    myOrders: () => api.get('/api/v1/orders/my'),
};

// ── Reviews ───────────────────────────────────────────────────────────────

export const reviewsApi = {
    list: (courseId: string, params?: any) => api.get(`/api/v1/courses/${courseId}/reviews`, { params }),
    create: (courseId: string, data: { rating: number; body?: string }) =>
        api.post(`/api/v1/courses/${courseId}/reviews`, data),
    update: (courseId: string, data: { rating: number; body?: string }) =>
        api.patch(`/api/v1/courses/${courseId}/reviews`, data),
    remove: (courseId: string) => api.delete(`/api/v1/courses/${courseId}/reviews`),
};

// ── Certificates ──────────────────────────────────────────────────────────

export const certificatesApi = {
    myCertificates: () => api.get('/api/v1/certificates/my'),
    verify: (uuid: string) => api.get(`/api/v1/certificates/verify/${uuid}`),
};

// ── Video ─────────────────────────────────────────────────────────────────

export const videoApi = {
    presign: (contentType?: string) => api.post('/api/v1/video-upload/presign', { contentType }),
    confirm: (data: any) => api.post('/api/v1/video-upload', data),
    get: (videoId: string) => api.get(`/api/v1/video-upload/${videoId}`),
    streamUrl: (videoId: string) => api.get(`/api/v1/video-upload/${videoId}/stream-url`),
};

// ── Admin ─────────────────────────────────────────────────────────────────

export const adminApi = {
    stats: () => api.get('/api/v1/admin/stats'),
    users: (params?: any) => api.get('/api/v1/admin/users', { params }),
    changeRole: (userId: string, role: string) => api.patch(`/api/v1/admin/users/${userId}/role`, { role }),
    banUser: (userId: string) => api.patch(`/api/v1/admin/users/${userId}/ban`),
    unbanUser: (userId: string) => api.patch(`/api/v1/admin/users/${userId}/unban`),
    instructorApplications: () => api.get('/api/v1/admin/instructor-applications'),
    approveInstructor: (id: string) => api.post(`/api/v1/admin/instructor-applications/${id}/approve`),
    rejectInstructor: (id: string, reason: string) => api.post(`/api/v1/admin/instructor-applications/${id}/reject`, { reason }),
    allCourses: (status?: string) => api.get('/api/v1/admin/courses', { params: { status } }),
    publishCourse: (id: string) => api.post(`/api/v1/admin/courses/${id}/publish`),
    rejectCourse: (id: string, feedback: string) => api.post(`/api/v1/admin/courses/${id}/reject`, { feedback }),
    archiveCourse: (id: string) => api.post(`/api/v1/admin/courses/${id}/archive`),
};

// ── Users ─────────────────────────────────────────────────────────────────

export const usersApi = {
    updateProfile: (data: any) => api.patch('/api/v1/users/me', data),
    changePassword: (data: any) => api.post('/api/v1/users/me/change-password', data),
    applyInstructor: (data: any) => api.post('/api/v1/users/me/apply-instructor', data),
    instructorProfile: (userId: string) => api.get(`/api/v1/users/instructor/${userId}`),
    instructorAnalytics: () => api.get('/api/v1/admin/instructor-analytics'),
};

// ── Sections ──────────────────────────────────────────────────────────────

export const sectionsApi = {
    create: (courseId: string, data: { title: string }) =>
        api.post(`/api/v1/courses/${courseId}/sections`, data),
    update: (courseId: string, sectionId: string, data: { title: string }) =>
        api.patch(`/api/v1/courses/${courseId}/sections/${sectionId}`, data),
    remove: (courseId: string, sectionId: string) =>
        api.delete(`/api/v1/courses/${courseId}/sections/${sectionId}`),
    reorder: (courseId: string, orderedIds: string[]) =>
        api.put(`/api/v1/courses/${courseId}/sections/reorder`, { orderedIds }),
};

// ── Lessons ───────────────────────────────────────────────────────────────

export const lessonsApi = {
    create: (sectionId: string, data: any) =>
        api.post(`/api/v1/sections/${sectionId}/lessons`, data),
    update: (lessonId: string, data: any) =>
        api.patch(`/api/v1/lessons/${lessonId}`, data),
    remove: (lessonId: string) =>
        api.delete(`/api/v1/lessons/${lessonId}`),
    reorder: (sectionId: string, orderedIds: string[]) =>
        api.put(`/api/v1/sections/${sectionId}/lessons/reorder`, { orderedIds }),
    streamToken: (courseId: string, lessonId: string) =>
        api.get(`/api/v1/courses/${courseId}/lessons/${lessonId}/stream-token`),
};

// ── Q&A ───────────────────────────────────────────────────────────────────

export const qaApi = {
    listQuestions: (lessonId: string) => api.get(`/api/v1/lessons/${lessonId}/questions`),
    postQuestion: (lessonId: string, data: { body: string }) =>
        api.post(`/api/v1/lessons/${lessonId}/questions`, data),
    postAnswer: (questionId: string, data: { body: string }) =>
        api.post(`/api/v1/questions/${questionId}/answers`, data),
};

// ── Notifications ─────────────────────────────────────────────────────────

export const notificationsApi = {
    list: (params?: { page?: number; limit?: number }) =>
        api.get('/api/v1/notifications', { params }),
    unreadCount: () => api.get('/api/v1/notifications/unread-count'),
    markRead: (id: string) => api.patch(`/api/v1/notifications/${id}/read`),
    markAllRead: () => api.patch('/api/v1/notifications/read-all'),
};

// ── Instructor ────────────────────────────────────────────────────────────

export const instructorApi = {
    dashboard: () => api.get('/api/v1/instructor/dashboard'),
    analytics: (courseId: string) => api.get(`/api/v1/instructor/courses/${courseId}/analytics`),
    students: (courseId: string) => api.get(`/api/v1/instructor/courses/${courseId}/students`),
};
