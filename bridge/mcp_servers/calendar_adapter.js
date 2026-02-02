/**
 * Calendar MCP Server
 * 
 * Provides calendar integration tools for the AI assistant.
 * Supports reading, creating, updating, and deleting calendar events.
 * 
 * Features:
 * - Query upcoming events
 * - Create new events
 * - Update existing events
 * - Delete events
 * - Check availability
 * - Search events
 */

const { Server } = require("@modelcontextprotocol/sdk/server/index.js");
const {
    CallToolRequestSchema,
    ListToolsRequestSchema,
} = require("@modelcontextprotocol/sdk/types.js");

// Calendar Tool Definitions
const CALENDAR_TOOLS = [
    {
        name: "calendar_get_events",
        description: "Get calendar events for a specified time range. Returns upcoming events by default.",
        inputSchema: {
            type: "object",
            properties: {
                startDate: { 
                    type: "string", 
                    description: "Start date/time in ISO 8601 format (e.g., '2024-01-15T09:00:00'). Defaults to now." 
                },
                endDate: { 
                    type: "string", 
                    description: "End date/time in ISO 8601 format. Defaults to 7 days from start." 
                },
                calendarId: { 
                    type: "string", 
                    description: "Specific calendar ID to query. Defaults to primary calendar." 
                },
                maxResults: { 
                    type: "number", 
                    description: "Maximum number of events to return (default: 10, max: 100)",
                    default: 10
                },
                query: { 
                    type: "string", 
                    description: "Search query to filter events by title or description" 
                }
            }
        }
    },
    {
        name: "calendar_create_event",
        description: "Create a new calendar event. Returns the created event details.",
        inputSchema: {
            type: "object",
            properties: {
                title: { type: "string", description: "Event title/summary" },
                startDateTime: { type: "string", description: "Start date/time in ISO 8601 format" },
                endDateTime: { type: "string", description: "End date/time in ISO 8601 format" },
                description: { type: "string", description: "Event description/notes" },
                location: { type: "string", description: "Event location" },
                attendees: { 
                    type: "array", 
                    items: { type: "string" },
                    description: "List of attendee email addresses" 
                },
                reminders: {
                    type: "array",
                    items: {
                        type: "object",
                        properties: {
                            method: { type: "string", enum: ["email", "popup", "sms"] },
                            minutes: { type: "number" }
                        }
                    },
                    description: "Reminder notifications before event"
                },
                recurrence: {
                    type: "object",
                    properties: {
                        frequency: { type: "string", enum: ["daily", "weekly", "monthly", "yearly"] },
                        interval: { type: "number", description: "Interval between occurrences" },
                        count: { type: "number", description: "Number of occurrences" },
                        until: { type: "string", description: "End date for recurrence" }
                    },
                    description: "Recurrence rule for repeating events"
                },
                allDay: { type: "boolean", description: "Whether this is an all-day event", default: false },
                calendarId: { type: "string", description: "Calendar to create event in (default: primary)" }
            },
            required: ["title", "startDateTime", "endDateTime"]
        }
    },
    {
        name: "calendar_update_event",
        description: "Update an existing calendar event. Only specified fields will be updated.",
        inputSchema: {
            type: "object",
            properties: {
                eventId: { type: "string", description: "ID of the event to update" },
                title: { type: "string", description: "New event title" },
                startDateTime: { type: "string", description: "New start date/time" },
                endDateTime: { type: "string", description: "New end date/time" },
                description: { type: "string", description: "New description" },
                location: { type: "string", description: "New location" },
                calendarId: { type: "string", description: "Calendar containing the event" }
            },
            required: ["eventId"]
        }
    },
    {
        name: "calendar_delete_event",
        description: "Delete a calendar event.",
        inputSchema: {
            type: "object",
            properties: {
                eventId: { type: "string", description: "ID of the event to delete" },
                calendarId: { type: "string", description: "Calendar containing the event" },
                notifyAttendees: { type: "boolean", description: "Whether to notify attendees of cancellation", default: true }
            },
            required: ["eventId"]
        }
    },
    {
        name: "calendar_check_availability",
        description: "Check availability for a time slot. Returns whether the user is free or busy.",
        inputSchema: {
            type: "object",
            properties: {
                startDateTime: { type: "string", description: "Start of time range to check" },
                endDateTime: { type: "string", description: "End of time range to check" },
                calendarIds: { 
                    type: "array", 
                    items: { type: "string" },
                    description: "Calendars to check (default: all)" 
                }
            },
            required: ["startDateTime", "endDateTime"]
        }
    },
    {
        name: "calendar_find_free_time",
        description: "Find available time slots within a date range. Useful for scheduling meetings.",
        inputSchema: {
            type: "object",
            properties: {
                startDate: { type: "string", description: "Start of search range" },
                endDate: { type: "string", description: "End of search range" },
                durationMinutes: { type: "number", description: "Required duration in minutes" },
                workingHoursOnly: { type: "boolean", description: "Only return slots during working hours (9 AM - 5 PM)", default: true },
                maxSlots: { type: "number", description: "Maximum number of slots to return", default: 5 }
            },
            required: ["startDate", "endDate", "durationMinutes"]
        }
    },
    {
        name: "calendar_list_calendars",
        description: "List all available calendars for the user.",
        inputSchema: {
            type: "object",
            properties: {}
        }
    },
    {
        name: "calendar_get_today",
        description: "Get today's calendar events. Convenience method for quick daily overview.",
        inputSchema: {
            type: "object",
            properties: {
                calendarId: { type: "string", description: "Specific calendar to query" }
            }
        }
    }
];

class CalendarMCPServer {
    constructor(bridgeCallback) {
        this.bridgeCallback = bridgeCallback || this.defaultCallback;
        this.server = new Server(
            {
                name: "calendar-tools",
                version: "1.0.0",
            },
            {
                capabilities: {
                    tools: {},
                },
            }
        );

        this.setupHandlers();
        console.log('📅 Calendar MCP Server initialized with', CALENDAR_TOOLS.length, 'tools');
    }
    
    // Default callback for testing
    defaultCallback = async (name, args) => {
        console.log(`📅 Calendar Tool (Simulated): ${name}`, args);
        
        // Return simulated responses based on tool
        switch (name) {
            case 'calendar_get_events':
            case 'calendar_get_today':
                return {
                    success: true,
                    events: [
                        {
                            id: 'event_' + Date.now(),
                            title: 'Sample Meeting',
                            startDateTime: new Date().toISOString(),
                            endDateTime: new Date(Date.now() + 3600000).toISOString(),
                            location: 'Conference Room A',
                            description: 'Sample event description'
                        }
                    ],
                    simulated: true
                };
            
            case 'calendar_create_event':
                return {
                    success: true,
                    event: {
                        id: 'event_' + Date.now(),
                        ...args
                    },
                    message: 'Event created successfully',
                    simulated: true
                };
            
            case 'calendar_update_event':
                return {
                    success: true,
                    event: {
                        id: args.eventId,
                        ...args
                    },
                    message: 'Event updated successfully',
                    simulated: true
                };
            
            case 'calendar_delete_event':
                return {
                    success: true,
                    message: 'Event deleted successfully',
                    simulated: true
                };
            
            case 'calendar_check_availability':
                return {
                    success: true,
                    available: true,
                    conflicts: [],
                    simulated: true
                };
            
            case 'calendar_find_free_time':
                return {
                    success: true,
                    freeSlots: [
                        {
                            startDateTime: new Date().toISOString(),
                            endDateTime: new Date(Date.now() + args.durationMinutes * 60000).toISOString()
                        }
                    ],
                    simulated: true
                };
            
            case 'calendar_list_calendars':
                return {
                    success: true,
                    calendars: [
                        { id: 'primary', name: 'Primary Calendar', primary: true },
                        { id: 'work', name: 'Work Calendar', primary: false }
                    ],
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
            return { tools: CALENDAR_TOOLS };
        });

        // Handle tool calls
        this.server.setRequestHandler(CallToolRequestSchema, async (request) => {
            const { name, arguments: args } = request.params;
            
            console.log(`📅 Calendar Tool Requested: ${name}`, args);
            
            try {
                // Validate tool exists
                const toolDef = CALENDAR_TOOLS.find(t => t.name === name);
                if (!toolDef) {
                    throw new Error(`Unknown calendar tool: ${name}`);
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
                console.error(`❌ Calendar Tool Error (${name}):`, error.message);
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
        return CALENDAR_TOOLS;
    }
}

module.exports = CalendarMCPServer;
