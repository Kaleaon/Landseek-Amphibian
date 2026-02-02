/**
 * Tests for Email MCP Server
 */

const EmailMCPServer = require('../mcp_servers/email_adapter');

describe('EmailMCPServer', () => {
    let server;

    beforeEach(() => {
        server = new EmailMCPServer();
    });

    describe('getTools', () => {
        it('should return all email tools', () => {
            const tools = server.getTools();
            
            expect(Array.isArray(tools)).toBe(true);
            expect(tools.length).toBeGreaterThan(0);
            
            const toolNames = tools.map(t => t.name);
            expect(toolNames).toContain('email_list_messages');
            expect(toolNames).toContain('email_read_message');
            expect(toolNames).toContain('email_send');
            expect(toolNames).toContain('email_reply');
            expect(toolNames).toContain('email_forward');
            expect(toolNames).toContain('email_search');
            expect(toolNames).toContain('email_move');
            expect(toolNames).toContain('email_delete');
            expect(toolNames).toContain('email_list_folders');
        });

        it('should have valid input schemas for all tools', () => {
            const tools = server.getTools();
            
            tools.forEach(tool => {
                expect(tool.inputSchema).toBeDefined();
                expect(tool.inputSchema.type).toBe('object');
                expect(tool.inputSchema.properties).toBeDefined();
            });
        });

        it('should have required fields defined where needed', () => {
            const tools = server.getTools();
            
            const sendTool = tools.find(t => t.name === 'email_send');
            expect(sendTool.inputSchema.required).toContain('to');
            expect(sendTool.inputSchema.required).toContain('subject');
            expect(sendTool.inputSchema.required).toContain('body');
            
            const readTool = tools.find(t => t.name === 'email_read_message');
            expect(readTool.inputSchema.required).toContain('messageId');
        });
    });

    describe('defaultCallback', () => {
        it('should return messages for email_list_messages', async () => {
            const result = await server.defaultCallback('email_list_messages', { folder: 'inbox' });
            
            expect(result.success).toBe(true);
            expect(result.simulated).toBe(true);
            expect(Array.isArray(result.messages)).toBe(true);
            expect(result.messages.length).toBeGreaterThan(0);
            
            const message = result.messages[0];
            expect(message.from).toBeDefined();
            expect(message.subject).toBeDefined();
            expect(message.date).toBeDefined();
        });

        it('should return full message for email_read_message', async () => {
            const result = await server.defaultCallback('email_read_message', { 
                messageId: 'test_123'
            });
            
            expect(result.success).toBe(true);
            expect(result.message).toBeDefined();
            expect(result.message.from).toBeDefined();
            expect(result.message.body).toBeDefined();
        });

        it('should return success for email_send', async () => {
            const args = {
                to: ['test@example.com'],
                subject: 'Test Subject',
                body: 'Test body content'
            };
            
            const result = await server.defaultCallback('email_send', args);
            
            expect(result.success).toBe(true);
            expect(result.messageId).toBeDefined();
        });

        it('should return search results for email_search', async () => {
            const result = await server.defaultCallback('email_search', { 
                query: 'important'
            });
            
            expect(result.success).toBe(true);
            expect(Array.isArray(result.results)).toBe(true);
        });

        it('should return folders for email_list_folders', async () => {
            const result = await server.defaultCallback('email_list_folders', {});
            
            expect(result.success).toBe(true);
            expect(Array.isArray(result.folders)).toBe(true);
            
            const folderNames = result.folders.map(f => f.id);
            expect(folderNames).toContain('inbox');
            expect(folderNames).toContain('sent');
            expect(folderNames).toContain('drafts');
        });

        it('should return unread count for email_get_unread_count', async () => {
            const result = await server.defaultCallback('email_get_unread_count', { 
                folder: 'inbox'
            });
            
            expect(result.success).toBe(true);
            expect(typeof result.unreadCount).toBe('number');
        });

        it('should return summary for email_get_summary', async () => {
            const result = await server.defaultCallback('email_get_summary', { 
                hours: 24
            });
            
            expect(result.success).toBe(true);
            expect(result.summary).toBeDefined();
            expect(typeof result.summary.totalNew).toBe('number');
            expect(typeof result.summary.unread).toBe('number');
        });
    });
});
