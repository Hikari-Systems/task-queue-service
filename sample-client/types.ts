export interface Task {
    id: string; // uuid
    description: string;
    toBeProcessedBy: string;
    runArgs: object;
}

export interface TaskLog {
    id: string; // uuid
    taskId: string; // uuid
    exitCode: number;
    runLog: string[];
    startedAt: Date;
    endedAt: Date;
}