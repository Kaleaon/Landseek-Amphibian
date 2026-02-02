/**
 * Tests for Calendar MCP Server
 */

const CalendarMCPServer = require('../mcp_servers/calendar_adapter');

describe('CalendarMCPServer', () => {
    let server;

    beforeEach(() => {
        server = new CalendarMCPServer();
    });

    describe('getTools', () => {
        it('should return all calendar tools', () => {
            const tools = server.getTools();
            
            expect(Array.isArray(tools)).toBe(true);
            expect(tools.length).toBeGreaterThan(0);
            
            const toolNames = tools.map(t => t.name);
            expect(toolNames).toContain('calendar_get_events');
            expect(toolNames).toContain('calendar_create_event');
            expect(toolNames).toContain('calendar_update_event');
            expect(toolNames).toContain('calendar_delete_event');
            expect(toolNames).toContain('calendar_check_availability');
            expect(toolNames).toContain('calendar_find_free_time');
            expect(toolNames).toContain('calendar_list_calendars');
            expect(toolNames).toContain('calendar_get_today');
        });

        it('should have valid input schemas for all tools', () => {
            const tools = server.getTools();
            
            tools.forEach(tool => {
                expect(tool.inputSchema).toBeDefined();
                expect(tool.inputSchema.type).toBe('object');
                expect(tool.inputSchema.properties).toBeDefined();
            });
        });
    });

    describe('defaultCallback', () => {
        it('should return simulated events for calendar_get_events', async () => {
            const result = await server.defaultCallback('calendar_get_events', {});
            
            expect(result.success).toBe(true);
            expect(result.simulated).toBe(true);
            expect(Array.isArray(result.events)).toBe(true);
            expect(result.events.length).toBeGreaterThan(0);
            expect(result.events[0].title).toBeDefined();
        });

        it('should return created event for calendar_create_event', async () => {
            const args = {
                title: 'Test Meeting',
                startDateTime: new Date().toISOString(),
                endDateTime: new Date(Date.now() + 3600000).toISOString()
            };
            
            const result = await server.defaultCallback('calendar_create_event', args);
            
            expect(result.success).toBe(true);
            expect(result.event).toBeDefined();
            expect(result.event.title).toBe('Test Meeting');
        });

        it('should return availability for calendar_check_availability', async () => {
            const args = {
                startDateTime: new Date().toISOString(),
                endDateTime: new Date(Date.now() + 3600000).toISOString()
            };
            
            const result = await server.defaultCallback('calendar_check_availability', args);
            
            expect(result.success).toBe(true);
            expect(typeof result.available).toBe('boolean');
            expect(Array.isArray(result.conflicts)).toBe(true);
        });

        it('should return free slots for calendar_find_free_time', async () => {
            const args = {
                startDate: new Date().toISOString(),
                endDate: new Date(Date.now() + 86400000).toISOString(),
                durationMinutes: 60
            };
            
            const result = await server.defaultCallback('calendar_find_free_time', args);
            
            expect(result.success).toBe(true);
            expect(Array.isArray(result.freeSlots)).toBe(true);
        });

        it('should return calendars for calendar_list_calendars', async () => {
            const result = await server.defaultCallback('calendar_list_calendars', {});
            
            expect(result.success).toBe(true);
            expect(Array.isArray(result.calendars)).toBe(true);
            expect(result.calendars.length).toBeGreaterThan(0);
        });
    });
});
