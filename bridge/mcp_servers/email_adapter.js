/**
 * Email MCP Server
 * 
 * Provides email integration tools for the AI assistant.
 * Supports reading, composing, replying, and managing emails.
 * 
 * Features:
 * - List inbox messages
 * - Read email content
 * - Compose and send emails
 * - Reply to emails
 * - Search emails
 * - Manage folders/labels
 * - Handle attachments
 */

const { Server } = require("@modelcontextprotocol/sdk/server/index.js");
const {
    CallToolRequestSchema,
    ListToolsRequestSchema,
} = require("@modelcontextprotocol/sdk/types.js");

// Email Tool Definitions
const EMAIL_TOOLS = [
    {
        name: "email_list_messages",
        description: "List email messages from inbox or specified folder. Returns message summaries.",
        inputSchema: {
            type: "object",
            properties: {
                folder: { 
                    type: "string", 
                    description: "Folder to list (inbox, sent, drafts, trash, spam, or custom label)",
                    default: "inbox"
                },
                maxResults: { 
                    type: "number", 
                    description: "Maximum number of messages to return (default: 20, max: 100)",
                    default: 20
                },
                unreadOnly: { 
                    type: "boolean", 
                    description: "Only return unread messages",
                    default: false
                },
                fromDate: { 
                    type: "string", 
                    description: "Filter messages from this date (ISO 8601)" 
                },
                toDate: { 
                    type: "string", 
                    description: "Filter messages until this date (ISO 8601)" 
                },
                from: { 
                    type: "string", 
                    description: "Filter by sender email address" 
                },
                hasAttachment: { 
                    type: "boolean", 
                    description: "Only return messages with attachments" 
                }
            }
        }
    },
    {
        name: "email_read_message",
        description: "Read the full content of a specific email message including body and attachments.",
        inputSchema: {
            type: "object",
            properties: {
                messageId: { type: "string", description: "ID of the message to read" },
                markAsRead: { type: "boolean", description: "Mark the message as read", default: true },
                includeAttachments: { type: "boolean", description: "Include attachment metadata", default: true }
            },
            required: ["messageId"]
        }
    },
    {
        name: "email_send",
        description: "Compose and send a new email message.",
        inputSchema: {
            type: "object",
            properties: {
                to: { 
                    type: "array", 
                    items: { type: "string" },
                    description: "Recipient email addresses" 
                },
                cc: { 
                    type: "array", 
                    items: { type: "string" },
                    description: "CC recipient email addresses" 
                },
                bcc: { 
                    type: "array", 
                    items: { type: "string" },
                    description: "BCC recipient email addresses" 
                },
                subject: { type: "string", description: "Email subject line" },
                body: { type: "string", description: "Email body content" },
                isHtml: { type: "boolean", description: "Whether body is HTML formatted", default: false },
                attachments: {
                    type: "array",
                    items: {
                        type: "object",
                        properties: {
                            filename: { type: "string" },
                            path: { type: "string", description: "Path to file to attach" },
                            mimeType: { type: "string" }
                        }
                    },
                    description: "Files to attach"
                },
                priority: { 
                    type: "string", 
                    enum: ["high", "normal", "low"],
                    description: "Email priority",
                    default: "normal"
                },
                sendLater: { 
                    type: "string", 
                    description: "Schedule send time (ISO 8601)" 
                }
            },
            required: ["to", "subject", "body"]
        }
    },
    {
        name: "email_reply",
        description: "Reply to an existing email message.",
        inputSchema: {
            type: "object",
            properties: {
                messageId: { type: "string", description: "ID of the message to reply to" },
                body: { type: "string", description: "Reply body content" },
                replyAll: { type: "boolean", description: "Reply to all recipients", default: false },
                includeQuote: { type: "boolean", description: "Include original message in reply", default: true }
            },
            required: ["messageId", "body"]
        }
    },
    {
        name: "email_forward",
        description: "Forward an email message to new recipients.",
        inputSchema: {
            type: "object",
            properties: {
                messageId: { type: "string", description: "ID of the message to forward" },
                to: { 
                    type: "array", 
                    items: { type: "string" },
                    description: "Recipient email addresses" 
                },
                additionalMessage: { type: "string", description: "Message to add before forwarded content" },
                includeAttachments: { type: "boolean", description: "Include original attachments", default: true }
            },
            required: ["messageId", "to"]
        }
    },
    {
        name: "email_search",
        description: "Search emails by various criteria.",
        inputSchema: {
            type: "object",
            properties: {
                query: { type: "string", description: "Search query (supports Gmail-style search operators)" },
                folder: { type: "string", description: "Folder to search in (default: all)" },
                maxResults: { type: "number", description: "Maximum results to return", default: 20 },
                from: { type: "string", description: "Filter by sender" },
                to: { type: "string", description: "Filter by recipient" },
                subject: { type: "string", description: "Filter by subject" },
                hasAttachment: { type: "boolean", description: "Only messages with attachments" },
                isUnread: { type: "boolean", description: "Only unread messages" },
                isStarred: { type: "boolean", description: "Only starred messages" },
                afterDate: { type: "string", description: "Messages after this date" },
                beforeDate: { type: "string", description: "Messages before this date" }
            },
            required: ["query"]
        }
    },
    {
        name: "email_move",
        description: "Move an email to a different folder/label.",
        inputSchema: {
            type: "object",
            properties: {
                messageId: { type: "string", description: "ID of the message to move" },
                destinationFolder: { type: "string", description: "Destination folder (inbox, trash, spam, archive, or custom)" }
            },
            required: ["messageId", "destinationFolder"]
        }
    },
    {
        name: "email_delete",
        description: "Delete an email message (move to trash).",
        inputSchema: {
            type: "object",
            properties: {
                messageId: { type: "string", description: "ID of the message to delete" },
                permanent: { type: "boolean", description: "Permanently delete (skip trash)", default: false }
            },
            required: ["messageId"]
        }
    },
    {
        name: "email_mark_read",
        description: "Mark one or more emails as read or unread.",
        inputSchema: {
            type: "object",
            properties: {
                messageIds: { 
                    type: "array", 
                    items: { type: "string" },
                    description: "IDs of messages to mark" 
                },
                read: { type: "boolean", description: "Mark as read (true) or unread (false)", default: true }
            },
            required: ["messageIds"]
        }
    },
    {
        name: "email_star",
        description: "Star or unstar email messages.",
        inputSchema: {
            type: "object",
            properties: {
                messageIds: { 
                    type: "array", 
                    items: { type: "string" },
                    description: "IDs of messages to star/unstar" 
                },
                starred: { type: "boolean", description: "Star (true) or unstar (false)", default: true }
            },
            required: ["messageIds"]
        }
    },
    {
        name: "email_list_folders",
        description: "List available email folders/labels.",
        inputSchema: {
            type: "object",
            properties: {}
        }
    },
    {
        name: "email_create_folder",
        description: "Create a new email folder/label.",
        inputSchema: {
            type: "object",
            properties: {
                name: { type: "string", description: "Name of the new folder" },
                parentFolder: { type: "string", description: "Parent folder for nested labels" }
            },
            required: ["name"]
        }
    },
    {
        name: "email_get_unread_count",
        description: "Get the count of unread emails in inbox or specified folder.",
        inputSchema: {
            type: "object",
            properties: {
                folder: { type: "string", description: "Folder to check (default: inbox)", default: "inbox" }
            }
        }
    },
    {
        name: "email_draft_save",
        description: "Save an email as a draft.",
        inputSchema: {
            type: "object",
            properties: {
                to: { 
                    type: "array", 
                    items: { type: "string" },
                    description: "Recipient email addresses" 
                },
                subject: { type: "string", description: "Email subject" },
                body: { type: "string", description: "Email body" },
                isHtml: { type: "boolean", description: "Whether body is HTML", default: false }
            },
            required: ["body"]
        }
    },
    {
        name: "email_get_summary",
        description: "Get a quick summary of recent important emails. Perfect for daily briefings.",
        inputSchema: {
            type: "object",
            properties: {
                hours: { type: "number", description: "Look back N hours (default: 24)", default: 24 },
                importantOnly: { type: "boolean", description: "Only show important/priority emails", default: false }
            }
        }
    }
];

class EmailMCPServer {
    constructor(bridgeCallback) {
        this.bridgeCallback = bridgeCallback || this.defaultCallback;
        this.server = new Server(
            {
                name: "email-tools",
                version: "1.0.0",
            },
            {
                capabilities: {
                    tools: {},
                },
            }
        );

        this.setupHandlers();
        console.log('📧 Email MCP Server initialized with', EMAIL_TOOLS.length, 'tools');
    }
    
    // Default callback for testing
    defaultCallback = async (name, args) => {
        console.log(`📧 Email Tool (Simulated): ${name}`, args);
        
        // Return simulated responses
        switch (name) {
            case 'email_list_messages':
                return {
                    success: true,
                    messages: [
                        {
                            id: 'msg_' + Date.now(),
                            from: 'sender@example.com',
                            to: ['you@example.com'],
                            subject: 'Sample Email Subject',
                            snippet: 'This is a preview of the email content...',
                            date: new Date().toISOString(),
                            isRead: false,
                            hasAttachment: false,
                            isStarred: false
                        },
                        {
                            id: 'msg_' + (Date.now() + 1),
                            from: 'important@company.com',
                            to: ['you@example.com'],
                            subject: 'Important: Please Review',
                            snippet: 'Please review the attached document...',
                            date: new Date(Date.now() - 3600000).toISOString(),
                            isRead: true,
                            hasAttachment: true,
                            isStarred: true
                        }
                    ],
                    totalMessages: 2,
                    simulated: true
                };
            
            case 'email_read_message':
                return {
                    success: true,
                    message: {
                        id: args.messageId,
                        from: 'sender@example.com',
                        to: ['you@example.com'],
                        cc: [],
                        subject: 'Sample Email',
                        body: 'This is the full body of the email message.\n\nBest regards,\nSender',
                        htmlBody: null,
                        date: new Date().toISOString(),
                        attachments: [],
                        headers: {
                            'message-id': '<sample@example.com>',
                            'date': new Date().toISOString()
                        }
                    },
                    simulated: true
                };
            
            case 'email_send':
                return {
                    success: true,
                    messageId: 'msg_sent_' + Date.now(),
                    message: 'Email sent successfully',
                    simulated: true
                };
            
            case 'email_reply':
            case 'email_forward':
                return {
                    success: true,
                    messageId: 'msg_' + Date.now(),
                    message: `Email ${name === 'email_reply' ? 'reply' : 'forward'} sent successfully`,
                    simulated: true
                };
            
            case 'email_search':
                return {
                    success: true,
                    results: [
                        {
                            id: 'msg_search_' + Date.now(),
                            from: 'found@example.com',
                            subject: `Search result for "${args.query}"`,
                            snippet: 'Matching content...',
                            date: new Date().toISOString()
                        }
                    ],
                    totalResults: 1,
                    simulated: true
                };
            
            case 'email_move':
            case 'email_delete':
            case 'email_mark_read':
            case 'email_star':
                return {
                    success: true,
                    message: `Operation ${name} completed successfully`,
                    simulated: true
                };
            
            case 'email_list_folders':
                return {
                    success: true,
                    folders: [
                        { id: 'inbox', name: 'Inbox', unreadCount: 5 },
                        { id: 'sent', name: 'Sent', unreadCount: 0 },
                        { id: 'drafts', name: 'Drafts', unreadCount: 0 },
                        { id: 'trash', name: 'Trash', unreadCount: 0 },
                        { id: 'spam', name: 'Spam', unreadCount: 2 }
                    ],
                    simulated: true
                };
            
            case 'email_create_folder':
                return {
                    success: true,
                    folder: { id: 'folder_' + Date.now(), name: args.name },
                    simulated: true
                };
            
            case 'email_get_unread_count':
                return {
                    success: true,
                    folder: args.folder || 'inbox',
                    unreadCount: 5,
                    simulated: true
                };
            
            case 'email_draft_save':
                return {
                    success: true,
                    draftId: 'draft_' + Date.now(),
                    message: 'Draft saved successfully',
                    simulated: true
                };
            
            case 'email_get_summary':
                return {
                    success: true,
                    summary: {
                        totalNew: 12,
                        unread: 5,
                        important: 2,
                        needsResponse: 3,
                        highlights: [
                            'Meeting request from boss@company.com',
                            'Invoice due from billing@vendor.com'
                        ]
                    },
                    simulated: true
                };
            
            default:
                return { 
                    success: true, 
                    message: `${name} executed (simulation mode)`,
                    data: args,
                    simulated: true
                };
        }
    };

    setupHandlers() {
        // List available tools
        this.server.setRequestHandler(ListToolsRequestSchema, async () => {
            return { tools: EMAIL_TOOLS };
        });

        // Handle tool calls
        this.server.setRequestHandler(CallToolRequestSchema, async (request) => {
            const { name, arguments: args } = request.params;
            
            console.log(`📧 Email Tool Requested: ${name}`, args);
            
            try {
                // Validate tool exists
                const toolDef = EMAIL_TOOLS.find(t => t.name === name);
                if (!toolDef) {
                    throw new Error(`Unknown email tool: ${name}`);
                }
                
                // Forward to Android/Bridge via callback
                const result = await this.bridgeCallback(name, args || {});
                
                return {
                    content: [{
                        type: "text",
                        text: typeof result === 'string' ? result : JSON.stringify(result, null, 2)
                    }]
                };
            } catch (error) {
                console.error(`❌ Email Tool Error (${name}):`, error.message);
                return {
                    content: [{
                        type: "text",
                        text: `Error executing ${name}: ${error.message}`
                    }],
                    isError: true
                };
            }
        });
    }

    async connect(transport) {
        await this.server.connect(transport);
    }
    
    getTools() {
        return EMAIL_TOOLS;
    }
}

module.exports = EmailMCPServer;
