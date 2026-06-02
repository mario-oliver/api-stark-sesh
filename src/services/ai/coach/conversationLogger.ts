export interface MessageMetrics {
  userMessage: string
  response: string
  promptTokens: number
  completionTokens: number
  reasoningTokens: number
  totalTokens: number
  toolsCalled: Array<{
    name: string
    args: Record<string, any>
    duration?: number
  }>
  responseTimeMs: number
}

export class ConversationLogger {
  constructor(private prisma: any) {}

  /**
   * Get or create a conversation record
   */
  async getOrCreateConversation(threadId: string, sheetId: string, userId: string, title?: string) {
    let conversation = await this.prisma.coachConversation.findUnique({
      where: { threadId }
    })

    if (!conversation) {
      conversation = await this.prisma.coachConversation.create({
        data: {
          threadId,
          sheetId,
          userId,
          title // Save title if provided
        }
      })
    }

    return conversation
  }

  /**
   * Log a message exchange with metrics
   */
  async logMessageExchange(threadId: string, sheetId: string, userId: string, metrics: MessageMetrics, title?: string) {
    // Ensure conversation exists (with title if provided)
    const conversation = await this.getOrCreateConversation(threadId, sheetId, userId, title)

    // Create previews (first 200 chars) for quick display
    const userMessagePreview = metrics.userMessage.slice(0, 200)
    const responsePreview = metrics.response.slice(0, 200)

    // Store message log with FULL content + previews
    await this.prisma.coachMessageLog.create({
      data: {
        conversationId: conversation.id,
        // Full messages
        userMessage: metrics.userMessage,
        assistantMessage: metrics.response,
        // Previews for list views
        userMessagePreview,
        responsePreview,
        // Metrics
        promptTokens: metrics.promptTokens,
        completionTokens: metrics.completionTokens,
        reasoningTokens: metrics.reasoningTokens,
        totalTokens: metrics.totalTokens,
        toolsCalled: metrics.toolsCalled as any,
        responseTimeMs: metrics.responseTimeMs
      }
    })

    // Update conversation updatedAt
    await this.prisma.coachConversation.update({
      where: { id: conversation.id },
      data: { updatedAt: new Date() }
    })
  }

  /**
   * Get conversation statistics
   */
  async getConversationStats(threadId: string) {
    const conversation = await this.prisma.coachConversation.findUnique({
      where: { threadId },
      include: {
        messageLogs: {
          orderBy: { createdAt: 'desc' }
        }
      }
    })

    if (!conversation) {
      return null
    }

    const totalMessages = conversation.messageLogs.length
    const totalTokens = (conversation.messageLogs as any).reduce((sum: any, log: any) => sum + log.totalTokens, 0)
    const totalReasoningTokens = (conversation.messageLogs as any).reduce(
      (sum: any, log: any) => sum + log.reasoningTokens,
      0
    )
    const avgResponseTime =
      (conversation.messageLogs as any).reduce((sum: any, log: any) => sum + (log.responseTimeMs || 0), 0) /
      totalMessages

    const toolsUsed = (conversation.messageLogs as any).flatMap((log: any) =>
      (log.toolsCalled as Array<{ name: string }>).map(tool => tool.name)
    )
    const uniqueTools = [...new Set(toolsUsed)]

    return {
      conversationId: conversation.id,
      threadId: conversation.threadId,
      totalMessages,
      totalTokens,
      totalReasoningTokens,
      avgResponseTime,
      toolsUsed: uniqueTools,
      createdAt: conversation.createdAt,
      lastMessageAt: conversation.updatedAt
    }
  }

  /**
   * Get full conversation history with all messages
   */
  async getConversationHistory(threadId: string) {
    const conversation = await this.prisma.coachConversation.findUnique({
      where: { threadId },
      include: {
        messageLogs: {
          orderBy: { createdAt: 'asc' },
          select: {
            id: true,
            userMessage: true,
            assistantMessage: true,
            promptTokens: true,
            completionTokens: true,
            reasoningTokens: true,
            totalTokens: true,
            toolsCalled: true,
            responseTimeMs: true,
            createdAt: true
          }
        },
        sheet: {
          select: {
            id: true,
            title: true,
            mainGoal: true
          }
        }
      }
    })

    if (!conversation) {
      return null
    }

    // Transform to conversational format
    return {
      conversationId: conversation.id,
      threadId: conversation.threadId,
      sheet: conversation.sheet,
      messages: conversation.messageLogs.flatMap((log: any) => [
        {
          role: 'user',
          content: log.userMessage,
          timestamp: log.createdAt
        },
        {
          role: 'assistant',
          content: log.assistantMessage,
          timestamp: log.createdAt,
          metadata: {
            tokens: {
              prompt: log.promptTokens,
              completion: log.completionTokens,
              reasoning: log.reasoningTokens,
              total: log.totalTokens
            },
            toolsCalled: log.toolsCalled,
            responseTime: log.responseTimeMs
          }
        }
      ]),
      createdAt: conversation.createdAt,
      updatedAt: conversation.updatedAt
    }
  }

  /**
   * Get all conversation threads for a specific sheet (organized by topic)
   */
  async getSheetConversations(sheetId: string, userId: string) {
    return this.prisma.coachConversation.findMany({
      where: {
        sheetId,
        userId
      },
      include: {
        messageLogs: {
          orderBy: { createdAt: 'desc' },
          take: 1,
          select: {
            userMessagePreview: true,
            responsePreview: true,
            createdAt: true
          }
        },
        _count: {
          select: { messageLogs: true }
        }
      },
      orderBy: { updatedAt: 'desc' }
    })
  }

  /**
   * Get recent conversations for a user (with previews)
   */
  async getUserConversations(userId: string, limit = 10) {
    return this.prisma.coachConversation.findMany({
      where: { userId },
      include: {
        sheet: {
          select: {
            id: true,
            title: true,
            mainGoal: true
          }
        },
        messageLogs: {
          orderBy: { createdAt: 'desc' },
          take: 1,
          select: {
            userMessagePreview: true,
            responsePreview: true,
            createdAt: true
          }
        },
        _count: {
          select: { messageLogs: true }
        }
      },
      orderBy: { updatedAt: 'desc' },
      take: limit
    })
  }

  /**
   * Update conversation title (for organization)
   */
  async updateConversationTitle(threadId: string, title: string) {
    return this.prisma.coachConversation.update({
      where: { threadId },
      data: { title }
    })
  }
}
