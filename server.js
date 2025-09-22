const express = require('express');
const multer = require('multer');
const cloudinary = require('cloudinary').v2;
const { CloudinaryStorage } = require('multer-storage-cloudinary');
const cors = require('cors');
const crypto = require('crypto');
const path = require('path');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 3000;

// Configure Cloudinary
cloudinary.config({
    cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
    api_key: process.env.CLOUDINARY_API_KEY,
    api_secret: process.env.CLOUDINARY_API_SECRET
});

// Configure Cloudinary storage for multer
const storage = new CloudinaryStorage({
    cloudinary: cloudinary,
    params: {
        folder: 'contact_form_uploads',
        allowed_formats: ['jpg', 'jpeg', 'png', 'gif', 'pdf', 'doc', 'docx', 'mp4', 'avi', 'mov'],
        resource_type: 'auto',
        transformation: [
            {
                width: 1000,
                height: 1000,
                crop: 'limit',
                quality: 'auto:good'
            }
        ],
        // Add notification URL for webhooks
        notification_url: process.env.WEBHOOK_URL || `http://localhost:${PORT}/webhook/cloudinary`
    }
});

// Configure multer with Cloudinary storage
const upload = multer({
    storage: storage,
    limits: {
        fileSize: 10 * 1024 * 1024 // 10MB limit
    },
    fileFilter: (req, file, cb) => {
        const allowedTypes = /jpeg|jpg|png|gif|pdf|doc|docx|mp4|avi|mov|txt|csv|xlsx|xls/;
        const extname = allowedTypes.test(path.extname(file.originalname).toLowerCase());
        const mimetype = allowedTypes.test(file.mimetype);

        if (mimetype && extname) {
            return cb(null, true);
        } else {
            cb(new Error('Invalid file type. Please upload images, documents, or videos.'));
        }
    }
});

// Middleware
app.use(cors());
app.use('/webhook', express.raw({ type: 'application/json' })); // Raw body for webhook signature verification
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static('public'));

// In-memory storage for webhook events (use database in production)
const webhookEvents = [];
const uploadNotifications = new Map();

// Webhook signature verification function
function verifyWebhookSignature(body, signature, timestamp) {
    if (!process.env.CLOUDINARY_WEBHOOK_SECRET) {
        console.warn('⚠️  CLOUDINARY_WEBHOOK_SECRET not set. Webhook verification disabled.');
        return true; // Skip verification if secret is not set
    }

    try {
        // Cloudinary webhook signature format: timestamp=<timestamp>,signature=<signature>
        const parts = signature.split(',');
        const timestampPart = parts.find(part => part.startsWith('timestamp='));
        const signaturePart = parts.find(part => part.startsWith('signature='));

        if (!timestampPart || !signaturePart) {
            return false;
        }

        const webhookTimestamp = timestampPart.split('=')[1];
        const webhookSignature = signaturePart.split('=')[1];

        // Create expected signature
        const payload = `${webhookTimestamp}${body}`;
        const expectedSignature = crypto
            .createHmac('sha256', process.env.CLOUDINARY_WEBHOOK_SECRET)
            .update(payload)
            .digest('hex');

        return crypto.timingSafeEqual(
            Buffer.from(webhookSignature, 'hex'),
            Buffer.from(expectedSignature, 'hex')
        );
    } catch (error) {
        console.error('Webhook signature verification error:', error);
        return false;
    }
}

// Routes
app.get('/', (req, res) => {
    res.json({
        message: 'Contact Form Server with Cloudinary Webhooks',
        endpoints: {
            health: '/health',
            submit: '/submit-form',
            uploads: '/uploads',
            webhook: '/webhook/cloudinary',
            webhookEvents: '/webhook/events',
            testCloudinary: '/test-cloudinary'
        }
    });
});

// Cloudinary Webhook endpoint
app.post('/webhook/cloudinary', (req, res) => {
    try {
        const signature = req.get('X-Cld-Signature');
        const timestamp = req.get('X-Cld-Timestamp');
        const body = req.body.toString();

        console.log('📨 Received webhook from Cloudinary');
        console.log('Timestamp:', timestamp);
        console.log('Body length:', body.length);

        // Verify webhook signature
        if (!verifyWebhookSignature(body, signature, timestamp)) {
            console.error('❌ Webhook signature verification failed');
            return res.status(401).json({ error: 'Invalid signature' });
        }

        // Parse the webhook payload
        const payload = JSON.parse(body);
        console.log('✅ Webhook verified and parsed:', {
            notification_type: payload.notification_type,
            resource_type: payload.resource_type,
            public_id: payload.public_id
        });

        // Store webhook event
        const webhookEvent = {
            id: generateEventId(),
            timestamp: new Date().toISOString(),
            type: payload.notification_type,
            resourceType: payload.resource_type,
            publicId: payload.public_id,
            payload: payload
        };

        webhookEvents.push(webhookEvent);

        // Keep only last 100 events in memory
        if (webhookEvents.length > 100) {
            webhookEvents.shift();
        }

        // Handle different notification types
        switch (payload.notification_type) {
            case 'upload':
                handleUploadNotification(payload);
                break;
            case 'transformation':
                handleTransformationNotification(payload);
                break;
            case 'eager':
                handleEagerNotification(payload);
                break;
            case 'delete':
                handleDeleteNotification(payload);
                break;
            default:
                console.log(`Unhandled notification type: ${payload.notification_type}`);
        }

        res.status(200).json({ received: true, eventId: webhookEvent.id });

    } catch (error) {
        console.error('❌ Webhook processing error:', error);
        res.status(500).json({ error: 'Webhook processing failed' });
    }
});

// Webhook event handlers
function handleUploadNotification(payload) {
    console.log('📁 Upload completed:', payload.public_id);
    
    // Update upload notification status
    uploadNotifications.set(payload.public_id, {
        status: 'completed',
        timestamp: new Date().toISOString(),
        url: payload.secure_url,
        format: payload.format,
        bytes: payload.bytes
    });

    // Here you could:
    // - Send email notification to user
    // - Update database record
    // - Trigger additional processing
    // - Send real-time update to frontend via WebSocket
}

function handleTransformationNotification(payload) {
    console.log('🔄 Transformation completed:', payload.public_id);
    
    // Handle transformation completion
    // You could update the frontend about transformation status
}

function handleEagerNotification(payload) {
    console.log('⚡ Eager transformation completed:', payload.public_id);
    
    // Handle eager transformation completion
}

function handleDeleteNotification(payload) {
    console.log('🗑️  Resource deleted:', payload.public_id);
    
    // Clean up related data
    uploadNotifications.delete(payload.public_id);
}

// Get webhook events endpoint
app.get('/webhook/events', (req, res) => {
    const limit = parseInt(req.query.limit) || 20;
    const offset = parseInt(req.query.offset) || 0;
    
    const events = webhookEvents
        .slice(-limit - offset, webhookEvents.length - offset)
        .reverse();

    res.json({
        success: true,
        total: webhookEvents.length,
        events: events,
        pagination: {
            limit,
            offset,
            hasMore: webhookEvents.length > limit + offset
        }
    });
});

// Get upload notification status
app.get('/upload-status/:publicId', (req, res) => {
    const { publicId } = req.params;
    const notification = uploadNotifications.get(publicId);
    
    if (!notification) {
        return res.status(404).json({
            success: false,
            error: 'Upload notification not found'
        });
    }
    
    res.json({
        success: true,
        publicId,
        ...notification
    });
});

// Enhanced form submission with webhook tracking
app.post('/submit-form', upload.single('file'), async (req, res) => {
    try {
        const { name, email, message, youtubeUrl } = req.body;
        const selectedOption = req.body.option || (req.file ? 'file' : 'url');

        // Validation
        if (!name || !email) {
            return res.status(400).json({
                success: false,
                error: 'Name and email are required fields.'
            });
        }

        const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        if (!emailRegex.test(email)) {
            return res.status(400).json({
                success: false,
                error: 'Please provide a valid email address.'
            });
        }

        let fileInfo = null;
        let youtubeInfo = null;

        // Handle file upload
        if (selectedOption === 'file' && req.file) {
            fileInfo = {
                originalName: req.file.originalname,
                cloudinaryUrl: req.file.path,
                publicId: req.file.filename,
                size: req.file.size,
                format: req.file.format,
                resourceType: req.file.resource_type
            };

            // Set initial upload notification status
            uploadNotifications.set(req.file.filename, {
                status: 'processing',
                timestamp: new Date().toISOString(),
                originalName: req.file.originalname
            });
        }

        // Handle YouTube URL
        if (selectedOption === 'url' && youtubeUrl) {
            const youtubeRegex = /^(https?:\/\/)?(www\.)?(youtube\.com\/(watch\?v=|embed\/)|youtu\.be\/)[\w-]+/;
            if (!youtubeRegex.test(youtubeUrl)) {
                return res.status(400).json({
                    success: false,
                    error: 'Please provide a valid YouTube URL.'
                });
            }

            youtubeInfo = {
                url: youtubeUrl,
                videoId: extractYouTubeVideoId(youtubeUrl)
            };
        }

        const submission = {
            id: generateSubmissionId(),
            timestamp: new Date().toISOString(),
            contact: { name, email, message },
            option: selectedOption,
            file: fileInfo,
            youtube: youtubeInfo
        };

        console.log('📋 New form submission:', JSON.stringify(submission, null, 2));

        res.json({
            success: true,
            message: 'Form submitted successfully!',
            submissionId: submission.id,
            data: {
                option: selectedOption,
                hasFile: !!fileInfo,
                hasYouTube: !!youtubeInfo,
                filePublicId: fileInfo?.publicId
            }
        });

    } catch (error) {
        console.error('Form submission error:', error);
        
        if (error instanceof multer.MulterError) {
            if (error.code === 'LIMIT_FILE_SIZE') {
                return res.status(400).json({
                    success: false,
                    error: 'File size too large. Maximum size is 10MB.'
                });
            }
        }

        res.status(500).json({
            success: false,
            error: 'Internal server error. Please try again later.'
        });
    }
});

// Get uploaded files
app.get('/uploads', async (req, res) => {
    try {
        let result;
        
        try {
            result = await cloudinary.api.resources({
                type: 'upload',
                prefix: 'contact_form_uploads/',
                max_results: 30
            });
        } catch (folderError) {
            result = await cloudinary.api.resources({
                type: 'upload',
                max_results: 30
            });
        }

        res.json({
            success: true,
            total: result.resources.length,
            uploads: result.resources.map(resource => ({
                publicId: resource.public_id,
                url: resource.secure_url,
                format: resource.format,
                resourceType: resource.resource_type,
                createdAt: resource.created_at,
                size: resource.bytes,
                folder: resource.public_id.includes('/') ? resource.public_id.split('/')[0] : 'root',
                // Add webhook notification status if available
                webhookStatus: uploadNotifications.get(resource.public_id)?.status || 'unknown'
            }))
        });
        
    } catch (error) {
        console.error('Error fetching uploads:', error);
        res.status(500).json({
            success: false,
            error: `Failed to fetch uploads: ${error.message}`
        });
    }
});

// Delete uploaded file
app.delete('/uploads/:publicId', async (req, res) => {
    try {
        const { publicId } = req.params;
        const result = await cloudinary.uploader.destroy(publicId);
        
        // Clean up notification
        uploadNotifications.delete(publicId);
        
        res.json({
            success: true,
            message: 'File deleted successfully',
            result
        });
    } catch (error) {
        console.error('Error deleting file:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to delete file'
        });
    }
});

// Health check endpoint
app.get('/health', (req, res) => {
    res.json({
        status: 'OK',
        timestamp: new Date().toISOString(),
        cloudinary: {
            configured: !!(process.env.CLOUDINARY_CLOUD_NAME && process.env.CLOUDINARY_API_KEY && process.env.CLOUDINARY_API_SECRET),
            webhookSecret: !!process.env.CLOUDINARY_WEBHOOK_SECRET,
            cloud_name: process.env.CLOUDINARY_CLOUD_NAME
        },
        webhook: {
            url: process.env.WEBHOOK_URL || `http://localhost:${PORT}/webhook/cloudinary`,
            eventsCount: webhookEvents.length,
            notificationsCount: uploadNotifications.size
        }
    });
});

// Test Cloudinary connection
app.get('/test-cloudinary', async (req, res) => {
    try {
        const result = await cloudinary.api.resources({
            resource_type: 'image',
            max_results: 1
        });
        
        res.json({
            success: true,
            message: 'Cloudinary connection successful',
            total_resources: result.total_count
        });
    } catch (error) {
        console.error('Cloudinary test error:', error);
        res.json({
            success: false,
            error: error.message
        });
    }
});

// Setup webhook endpoint (for easy configuration)
app.post('/webhook/setup', async (req, res) => {
    try {
        const webhookUrl = process.env.WEBHOOK_URL || `http://localhost:${PORT}/webhook/cloudinary`;
        
        res.json({
            success: true,
            message: 'Webhook configuration',
            webhookUrl,
            instructions: {
                step1: 'Go to your Cloudinary Console',
                step2: 'Navigate to Settings > Webhooks',
                step3: `Add this URL: ${webhookUrl}`,
                step4: 'Select notification types: upload, delete, transformation',
                step5: 'Set the webhook secret in CLOUDINARY_WEBHOOK_SECRET environment variable'
            },
            currentConfig: {
                hasSecret: !!process.env.CLOUDINARY_WEBHOOK_SECRET,
                eventsReceived: webhookEvents.length
            }
        });
    } catch (error) {
        console.error('Webhook setup error:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to setup webhook configuration'
        });
    }
});

// Helper functions
function generateSubmissionId() {
    return 'sub_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9);
}

function generateEventId() {
    return 'evt_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9);
}

function extractYouTubeVideoId(url) {
    const regex = /(?:youtube\.com\/(?:[^\/]+\/.+\/|(?:v|e(?:mbed)?)\/|.*[?&]v=)|youtu\.be\/)([^"&?\/\s]{11})/;
    const match = url.match(regex);
    return match ? match[1] : null;
}

// Error handling middleware
app.use((error, req, res, next) => {
    console.error('Unhandled error:', error);
    res.status(500).json({
        success: false,
        error: 'Internal server error'
    });
});

// 404 handler
app.use((req, res) => {
    res.status(404).json({
        success: false,
        error: 'Endpoint not found'
    });
});

// Start server
app.listen(PORT, () => {
    console.log(`🚀 Server running on port ${PORT}`);
    console.log(`📊 Health check: http://localhost:${PORT}/health`);
    console.log(`🪝 Webhook endpoint: http://localhost:${PORT}/webhook/cloudinary`);
    console.log(`⚙️  Webhook setup: http://localhost:${PORT}/webhook/setup`);
    
    // Check configuration
    if (!process.env.CLOUDINARY_CLOUD_NAME || !process.env.CLOUDINARY_API_KEY || !process.env.CLOUDINARY_API_SECRET) {
        console.warn('⚠️  Cloudinary credentials not found!');
    } else {
        console.log('✅ Cloudinary configured');
    }
    
    if (!process.env.CLOUDINARY_WEBHOOK_SECRET) {
        console.warn('⚠️  CLOUDINARY_WEBHOOK_SECRET not set. Webhook signature verification disabled.');
    } else {
        console.log('✅ Webhook secret configured');
    }
});