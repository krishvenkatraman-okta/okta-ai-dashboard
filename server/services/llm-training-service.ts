/**
 * LLM Continuous Training and Improvement Service
 * Learns from user interactions and API responses to improve intent detection
 */

interface TrainingExample {
  id: string;
  userInput: string;
  expectedIntent: string;
  actualIntent?: string;
  apiSuccess: boolean;
  userFeedback?: 'positive' | 'negative' | 'neutral';
  timestamp: Date;
  context: {
    userRole: string;
    apiEndpoint?: string;
    errorMessage?: string;
  };
}

interface IntentPattern {
  pattern: string;
  intent: string;
  confidence: number;
  successRate: number;
  examples: number;
  lastUpdated: Date;
}

export class LLMTrainingService {
  private trainingData: TrainingExample[] = [];
  private intentPatterns: IntentPattern[] = [];
  private feedbackQueue: TrainingExample[] = [];

  constructor() {
    this.initializeBasePatterns();
    this.startPeriodicTraining();
  }

  private initializeBasePatterns(): void {
    // Initialize with known working patterns
    this.intentPatterns = [
      {
        pattern: 'access request|request access|catalog|available apps',
        intent: 'fetch_catalog',
        confidence: 0.9,
        successRate: 0.8,
        examples: 10,
        lastUpdated: new Date()
      },
      {
        pattern: '30-day|thirty day|unused|cleanup|review.*access',
        intent: 'fetch_30_day_review',
        confidence: 0.85,
        successRate: 0.7,
        examples: 8,
        lastUpdated: new Date()
      },
      {
        pattern: 'my apps|owned applications|show.*apps',
        intent: 'fetch_owned_apps',
        confidence: 0.8,
        successRate: 0.9,
        examples: 5,
        lastUpdated: new Date()
      },
      {
        pattern: 'governance.*campaign|create campaign|access review campaign',
        intent: 'create_governance_campaign',
        confidence: 0.75,
        successRate: 0.6,
        examples: 3,
        lastUpdated: new Date()
      }
    ];
  }

  /**
   * Record user interaction for training
   */
  async recordInteraction(
    userInput: string,
    detectedIntent: string,
    apiSuccess: boolean,
    userRole: string,
    apiEndpoint?: string,
    errorMessage?: string
  ): Promise<void> {
    const example: TrainingExample = {
      id: this.generateId(),
      userInput: userInput.toLowerCase(),
      expectedIntent: detectedIntent,
      actualIntent: detectedIntent,
      apiSuccess,
      timestamp: new Date(),
      context: {
        userRole,
        apiEndpoint,
        errorMessage
      }
    };

    this.trainingData.push(example);
    
    // Update pattern confidence based on success
    this.updatePatternConfidence(userInput, detectedIntent, apiSuccess);
    
    console.log(`📚 Training: Recorded interaction - Intent: ${detectedIntent}, Success: ${apiSuccess}`);
  }

  /**
   * Record explicit user feedback
   */
  async recordFeedback(
    interactionId: string,
    feedback: 'positive' | 'negative' | 'neutral',
    correctIntent?: string
  ): Promise<void> {
    const example = this.trainingData.find(t => t.id === interactionId);
    if (example) {
      example.userFeedback = feedback;
      if (correctIntent && correctIntent !== example.actualIntent) {
        example.expectedIntent = correctIntent;
        // Learn new pattern if correction provided
        this.learnNewPattern(example.userInput, correctIntent);
      }
      
      this.feedbackQueue.push(example);
      console.log(`🎯 Training: Recorded feedback - ${feedback} for intent: ${example.actualIntent}`);
    }
  }

  /**
   * Get improved intent detection based on learned patterns
   */
  async improvedIntentDetection(userInput: string, userRole: string): Promise<{
    intent: string;
    confidence: number;
    reasoning: string;
  } | null> {
    const input = userInput.toLowerCase();
    let bestMatch: { intent: string; confidence: number; reasoning: string } | null = null;

    for (const pattern of this.intentPatterns) {
      const regex = new RegExp(pattern.pattern, 'i');
      if (regex.test(input)) {
        // Calculate dynamic confidence based on success rate and recency
        const recencyBoost = this.calculateRecencyBoost(pattern.lastUpdated);
        const adjustedConfidence = pattern.confidence * pattern.successRate * recencyBoost;
        
        if (!bestMatch || adjustedConfidence > bestMatch.confidence) {
          bestMatch = {
            intent: pattern.intent,
            confidence: adjustedConfidence,
            reasoning: `Matched pattern "${pattern.pattern}" with ${pattern.examples} examples, ${(pattern.successRate * 100).toFixed(1)}% success rate`
          };
        }
      }
    }

    // Check for context-specific patterns
    const contextualMatch = this.checkContextualPatterns(input, userRole);
    if (contextualMatch && (!bestMatch || contextualMatch.confidence > bestMatch.confidence)) {
      bestMatch = contextualMatch;
    }

    return bestMatch;
  }

  private updatePatternConfidence(userInput: string, intent: string, success: boolean): void {
    const pattern = this.intentPatterns.find(p => p.intent === intent);
    if (pattern) {
      pattern.examples += 1;
      pattern.successRate = (pattern.successRate * (pattern.examples - 1) + (success ? 1 : 0)) / pattern.examples;
      pattern.lastUpdated = new Date();
      
      // Adjust confidence based on recent performance
      if (success) {
        pattern.confidence = Math.min(0.95, pattern.confidence + 0.01);
      } else {
        pattern.confidence = Math.max(0.1, pattern.confidence - 0.05);
      }
    }
  }

  private learnNewPattern(userInput: string, correctIntent: string): void {
    // Extract key phrases from user input
    const keyPhrases = this.extractKeyPhrases(userInput);
    const newPattern = keyPhrases.join('|');
    
    const existingPattern = this.intentPatterns.find(p => p.intent === correctIntent);
    if (existingPattern) {
      // Enhance existing pattern
      existingPattern.pattern += `|${newPattern}`;
      existingPattern.examples += 1;
      existingPattern.lastUpdated = new Date();
    } else {
      // Create new pattern
      this.intentPatterns.push({
        pattern: newPattern,
        intent: correctIntent,
        confidence: 0.6, // Start with moderate confidence
        successRate: 1.0, // Optimistic start
        examples: 1,
        lastUpdated: new Date()
      });
    }
    
    console.log(`🧠 Learning: New pattern learned for intent "${correctIntent}": ${newPattern}`);
  }

  private extractKeyPhrases(text: string): string[] {
    // Simple keyword extraction - can be enhanced with NLP libraries
    const stopWords = ['the', 'is', 'at', 'which', 'on', 'a', 'an', 'and', 'or', 'but', 'in', 'with', 'to', 'for', 'of', 'as', 'by', 'from', 'up', 'about', 'into', 'through', 'during', 'before', 'after', 'above', 'below', 'between'];
    const words = text.toLowerCase().split(/\s+/)
      .filter(word => word.length > 2 && !stopWords.includes(word))
      .slice(0, 3); // Take top 3 meaningful words
    
    return words;
  }

  private checkContextualPatterns(input: string, userRole: string): {
    intent: string;
    confidence: number;
    reasoning: string;
  } | null {
    // Role-based intent detection
    if (userRole === 'super_admin' || userRole === 'app_owner') {
      if (input.includes('campaign') || input.includes('review')) {
        return {
          intent: 'create_governance_campaign',
          confidence: 0.8,
          reasoning: 'Admin role detected with campaign/review keywords'
        };
      }
    }

    // Time-based patterns (e.g., end of month = more likely to be access reviews)
    const now = new Date();
    if (now.getDate() > 25) { // End of month
      if (input.includes('review') || input.includes('cleanup')) {
        return {
          intent: 'fetch_30_day_review',
          confidence: 0.85,
          reasoning: 'End-of-month timing suggests access review intent'
        };
      }
    }

    return null;
  }

  private calculateRecencyBoost(lastUpdated: Date): number {
    const daysSinceUpdate = (Date.now() - lastUpdated.getTime()) / (1000 * 60 * 60 * 24);
    return Math.max(0.8, 1 - (daysSinceUpdate * 0.01)); // Decay over time
  }

  /**
   * Periodic training to improve patterns
   */
  private startPeriodicTraining(): void {
    setInterval(() => {
      this.processTrainingQueue();
    }, 5 * 60 * 1000); // Every 5 minutes
  }

  private processTrainingQueue(): void {
    if (this.feedbackQueue.length === 0) return;

    console.log(`🔄 Training: Processing ${this.feedbackQueue.length} feedback examples`);
    
    // Process negative feedback to improve patterns
    const negativeExamples = this.feedbackQueue.filter(e => e.userFeedback === 'negative');
    negativeExamples.forEach(example => {
      this.adjustPatternForFailure(example);
    });

    // Process positive feedback to reinforce patterns
    const positiveExamples = this.feedbackQueue.filter(e => e.userFeedback === 'positive');
    positiveExamples.forEach(example => {
      this.reinforcePattern(example);
    });

    // Clear processed feedback
    this.feedbackQueue = [];
  }

  private adjustPatternForFailure(example: TrainingExample): void {
    const pattern = this.intentPatterns.find(p => p.intent === example.actualIntent);
    if (pattern) {
      pattern.confidence *= 0.9; // Reduce confidence
      pattern.successRate *= 0.95; // Reduce success rate
      console.log(`📉 Training: Reduced confidence for pattern ${pattern.intent}`);
    }
  }

  private reinforcePattern(example: TrainingExample): void {
    const pattern = this.intentPatterns.find(p => p.intent === example.actualIntent);
    if (pattern) {
      pattern.confidence = Math.min(0.95, pattern.confidence * 1.05);
      pattern.successRate = Math.min(1.0, pattern.successRate * 1.02);
      console.log(`📈 Training: Reinforced pattern ${pattern.intent}`);
    }
  }

  /**
   * Get training statistics
   */
  getTrainingStats(): {
    totalInteractions: number;
    patterns: IntentPattern[];
    recentSuccessRate: number;
    topPatterns: IntentPattern[];
  } {
    const recentInteractions = this.trainingData.filter(
      t => Date.now() - t.timestamp.getTime() < 24 * 60 * 60 * 1000 // Last 24 hours
    );

    const recentSuccessRate = recentInteractions.length > 0 
      ? recentInteractions.filter(i => i.apiSuccess).length / recentInteractions.length
      : 0;

    const topPatterns = this.intentPatterns
      .sort((a, b) => (b.confidence * b.successRate) - (a.confidence * a.successRate))
      .slice(0, 5);

    return {
      totalInteractions: this.trainingData.length,
      patterns: this.intentPatterns,
      recentSuccessRate,
      topPatterns
    };
  }

  private generateId(): string {
    return Date.now().toString(36) + Math.random().toString(36).substr(2);
  }
}