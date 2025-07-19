/**
 * Comprehensive Okta IGA API Documentation and Workflows
 * Based on Official Okta Identity Governance API 2024
 */

export interface ApiWorkflow {
  name: string;
  description: string;
  steps: ApiStep[];
  conditions: WorkflowCondition[];
}

export interface ApiStep {
  stepId: string;
  endpoint: string;
  method: string;
  description: string;
  requiredParams?: string[];
  optionalParams?: string[];
  bodySchema?: any;
  successConditions: string[];
  errorHandling: ErrorHandling[];
}

export interface WorkflowCondition {
  condition: string;
  action: string;
}

export interface ErrorHandling {
  errorCode: number | string;
  action: string;
  fallback?: string;
}

export const OKTA_IGA_WORKFLOWS: ApiWorkflow[] = [
  {
    name: 'access_request_complete_flow',
    description: 'Complete access request flow from app selection to submission',
    steps: [
      {
        stepId: 'list_applications',
        endpoint: '/governance/api/v2/my/catalogs/default/entries',
        method: 'GET',
        description: 'Get parent applications available for request',
        optionalParams: ['filter=not(parent pr)', 'limit=20'],
        successConditions: ['response.data.length > 0'],
        errorHandling: [
          { errorCode: 401, action: 'request_auth_token' },
          { errorCode: 403, action: 'insufficient_permissions', fallback: 'use_apps_api' }
        ]
      },
      {
        stepId: 'get_entitlements_for_app',
        endpoint: '/governance/api/v2/my/catalogs/default/entries',
        method: 'GET',
        description: 'Get child entitlements for selected application using parent filter',
        requiredParams: ['filter=parent eq "{appId}"'],
        optionalParams: ['limit=20'],
        successConditions: ['response.data.length > 0'],
        errorHandling: [
          { errorCode: 404, action: 'no_entitlements_available' },
          { errorCode: 401, action: 'refresh_token' }
        ]
      },
      {
        stepId: 'get_request_fields',
        endpoint: '/governance/api/v2/my/catalogs/default/entries/{entitlementId}/request-fields',
        method: 'GET',
        description: 'Get required form fields for specific entitlement',
        requiredParams: ['entitlementId'],
        optionalParams: ['requesterId'],
        successConditions: ['response.data.length >= 0'],
        errorHandling: [
          { errorCode: 404, action: 'use_default_justification_field' },
          { errorCode: 401, action: 'refresh_token' }
        ]
      },
      {
        stepId: 'submit_entitlement_request',
        endpoint: '/governance/api/v2/my/catalogs/default/entries/{entitlementId}/requests',
        method: 'POST',
        description: 'Submit access request for specific entitlement with required field values',
        requiredParams: ['entitlementId'],
        bodySchema: {
          requesterFieldValues: [
            {
              fieldId: 'string (from request-fields response)',
              value: 'string (user provided value)'
            }
          ]
        },
        successConditions: ['response.id', 'response.status'],
        errorHandling: [
          { errorCode: 400, action: 'validation_error_show_required_fields' },
          { errorCode: 409, action: 'conflict_already_has_access' },
          { errorCode: 401, action: 'refresh_token' }
        ]
      }
    ],
    conditions: [
      { condition: 'user says "request access to {appName}"', action: 'execute step list_applications and get_entitlements_for_app' },
      { condition: 'user says "I want {entitlementName}"', action: 'execute step get_request_fields' },
      { condition: 'user says "I want {entitlementName} for {justification}"', action: 'execute step submit_entitlement_request' }
    ]
  },
  {
    name: 'governance_30day_review',
    description: '30-day access review using System Log API',
    steps: [
      {
        stepId: 'get_user_apps',
        endpoint: '/api/v1/apps',
        method: 'GET',
        description: 'Get applications assigned to user',
        optionalParams: ['filter=user.id eq "{userId}"', 'limit=200'],
        successConditions: ['response.length > 0'],
        errorHandling: [
          { errorCode: 401, action: 'refresh_management_token' }
        ]
      },
      {
        stepId: 'get_authentication_logs',
        endpoint: '/api/v1/logs',
        method: 'GET',
        description: 'Get 30-day authentication events',
        requiredParams: ['filter=eventType eq "user.authentication.sso" and published gt "30d ago"'],
        optionalParams: ['limit=1000'],
        successConditions: ['response.length >= 0'],
        errorHandling: [
          { errorCode: 401, action: 'refresh_management_token' },
          { errorCode: 429, action: 'rate_limit_retry' }
        ]
      }
    ],
    conditions: [
      { condition: 'user asks for "governance review" or "30 day review"', action: 'execute all steps in parallel' }
    ]
  }
];

export const API_ENDPOINT_DOCUMENTATION = {
  '/governance/api/v2/my/catalogs/default/entries': {
    method: 'GET',
    description: 'List catalog entries (applications and entitlements)',
    filters: {
      'not(parent pr)': 'Get only parent applications (top-level)',
      'parent eq "{appId}"': 'Get entitlements for specific application',
      'status eq "ACTIVE"': 'Get only active entries'
    },
    commonParams: {
      limit: 'Number of results (default: 20, max: 200)',
      after: 'Cursor for pagination',
      match: 'Fuzzy search term'
    }
  },
  '/governance/api/v2/my/catalogs/default/entries/{entitlementId}/request-fields': {
    method: 'GET',
    description: 'Get required form fields for entitlement request',
    pathParams: {
      entitlementId: 'ID of the entitlement to request'
    },
    queryParams: {
      requesterId: 'Optional: ID of user making request (for personalized fields)'
    },
    responseStructure: {
      data: [
        {
          id: 'field identifier',
          type: 'TEXT|DURATION|SELECT|etc',
          required: 'boolean',
          label: 'field display name',
          value: 'default value if any',
          maximumValue: 'max value for duration fields'
        }
      ],
      metadata: {
        riskAssessment: 'separation of duty analysis'
      }
    }
  },
  '/governance/api/v2/my/catalogs/default/entries/{entitlementId}/requests': {
    method: 'POST',
    description: 'Submit access request for entitlement',
    pathParams: {
      entitlementId: 'ID of entitlement being requested'
    },
    bodySchema: {
      requesterFieldValues: [
        {
          fieldId: 'field ID from request-fields response',
          value: 'user provided value'
        }
      ]
    },
    responseStructure: {
      id: 'request ID',
      status: 'PENDING|APPROVED|DENIED',
      catalogEntryDisplayName: 'name of requested entitlement',
      requestedOn: 'ISO date string'
    }
  }
};

export class OktaApiDocumentationService {
  static findWorkflowForIntent(userMessage: string): ApiWorkflow | null {
    const message = userMessage.toLowerCase();
    
    // Check for access request workflow patterns
    if (message.includes('request access to') || 
        message.match(/I want (.+)/i)) {
      return OKTA_IGA_WORKFLOWS.find(w => w.name === 'access_request_complete_flow');
    }
    
    // Check for governance review patterns
    if (message.includes('governance') || message.includes('30') || 
        (message.includes('review') && message.includes('access'))) {
      return OKTA_IGA_WORKFLOWS.find(w => w.name === 'governance_30day_review');
    }
    
    return null;
  }
  
  private static matchesCondition(message: string, condition: string): boolean {
    // Simple pattern matching - can be enhanced with NLP
    const patterns = [
      /request access to (.+)/i,
      /I want (.+?) for (.+)/i,
      /I want (.+)/i,
      /governance review/i,
      /30.day review/i,
      /access review/i
    ];
    
    return patterns.some(pattern => pattern.test(message));
  }
  
  static getNextStep(workflow: ApiWorkflow, currentStep: string, context: any): ApiStep | null {
    const currentIndex = workflow.steps.findIndex(step => step.stepId === currentStep);
    if (currentIndex >= 0 && currentIndex < workflow.steps.length - 1) {
      return workflow.steps[currentIndex + 1];
    }
    return null;
  }
  
  static validateStepResponse(step: ApiStep, response: any): { valid: boolean; errors: string[] } {
    const errors: string[] = [];
    
    for (const condition of step.successConditions) {
      if (!this.evaluateCondition(condition, response)) {
        errors.push(`Failed condition: ${condition}`);
      }
    }
    
    return { valid: errors.length === 0, errors };
  }
  
  private static evaluateCondition(condition: string, response: any): boolean {
    // Simple condition evaluation - can be enhanced
    if (condition === 'response.data.length > 0') {
      return response.data && Array.isArray(response.data) && response.data.length > 0;
    }
    if (condition === 'response.data.length >= 0') {
      return response.data && Array.isArray(response.data);
    }
    if (condition === 'response.id') {
      return response.id !== undefined;
    }
    if (condition === 'response.status') {
      return response.status !== undefined;
    }
    return true;
  }
}