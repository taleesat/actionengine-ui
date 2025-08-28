import { v4 as uuidv4 } from 'uuid';
import React, { useState, useRef, useEffect } from "react";
import { Globe2 } from "lucide-react";
import { Run, Message, Workspace, Workflow, WorkflowStep } from "../../types/datamodel";
import { messageUtils } from "./rendermessage";
import DetailViewer from "./detail_viewer";
import { IPlanStep, IPlan } from "../../types/plan";
import ChatInput from "./chatinput";
import { IStatus } from "../../types/app";
import { Modal, Button, Collapse, Checkbox, Input, message } from "antd";

import WorkspaceDisplay from "./workspacedisplay";

const DETAIL_VIEWER_CONTAINER_ID = "detail-viewer-container";

interface RunViewProps {
  run: Run;
  onPause?: () => void;
  isDetailViewerMinimized: boolean;
  setIsDetailViewerMinimized: (minimized: boolean) => void;
  showDetailViewer: boolean;
  setShowDetailViewer: (show: boolean) => void;
  // Add new props needed for ChatInput
  onExecuteCommand?: (command: string) => void;
  onInputResponse?: (query: string, accepted?: boolean, plan?: IPlan) => void;
  onCancel?: () => void;
  error?: IStatus | null;
  chatInputRef?: React.RefObject<any>;
  workspace: Workspace | null;
  currentWorkflow: string | null;
  recordStatus: string | null; // "off" | "on"
  extractingResult: string | null;
  enable_upload?: boolean;
}

const RunView: React.FC<RunViewProps> = ({
  run,
  onPause,
  isDetailViewerMinimized,
  setIsDetailViewerMinimized,
  showDetailViewer,
  setShowDetailViewer,
  // Add new props here
  onExecuteCommand,
  onInputResponse,
  onCancel,
  error,
  chatInputRef,
  workspace,
  currentWorkflow,
  recordStatus,
  extractingResult,
  enable_upload = false,
}) => {
  const threadContainerRef = useRef<HTMLDivElement | null>(null);
  const [novncEndpoint, setNovncEndpoint] = useState<string | undefined>();
  const [novncProtocol, setNovncProtocol] = useState<string | undefined>();
  const [detailViewerExpanded, setDetailViewerExpanded] = useState(false);
  const [hiddenMessageIndices, setHiddenMessageIndices] = useState<Set<number>>(
    new Set()
  );
  const [hiddenStepExecutionIndices, setHiddenStepExecutionIndices] = useState<
    Set<number>
  >(new Set());
  const [localMessages, setLocalMessages] = useState<Message[]>([]);

  const isTogglingRef = useRef(false);

  // Add this state to track repeated step indices and their earlier occurrences
  const [repeatedStepIndices, setRepeatedStepIndices] = useState<Set<number>>(
    new Set()
  );
  const [failedStepIndices, setFailedStepIndices] = useState<Set<number>>(
    new Set()
  );

  // Add ref for the latest user message
  const latestUserMessageRef = useRef<HTMLDivElement | null>(null);

  // Add state to track the last plan message index
  const [lastPlanIndex, setLastPlanIndex] = useState<number>(-1);

  // Add this with other refs near the top of the component
  const buttonsContainerRef = useRef<HTMLDivElement | null>(null);

  // Combine scroll behavior when messages or status change
  useEffect(() => {
    if (run.messages.length > 0 && threadContainerRef.current) {
      // Use a small delay to ensure the DOM has updated
      setTimeout(() => {
        const container = threadContainerRef.current;
        if (container) {
          container.scrollTop = container.scrollHeight;
        }
      }, 100);
    }
  }, [run.messages, run.status]);

  // Effect to handle browser_address message
  useEffect(() => {
    const browserAddressMessages = run.messages.filter(
      (msg: Message) => msg.config.metadata?.type === "browser_address"
    );
    const lastBrowserAddressMsg =
      browserAddressMessages[browserAddressMessages.length - 1];
    console.log("Last browserAddressMsg", lastBrowserAddressMsg);
    // only update if novncEndpoint is it is different from the current novncEndpoint
    if (
      lastBrowserAddressMsg &&
      lastBrowserAddressMsg.config.metadata?.novnc_endpoint !== novncEndpoint
    ) {
      setNovncEndpoint(lastBrowserAddressMsg.config.metadata?.novnc_endpoint);
      setNovncProtocol(lastBrowserAddressMsg.config.metadata?.protocol || "http");
      // Show DetailViewer when novncEndpoint becomes available
      setShowDetailViewer(true);
      setIsDetailViewerMinimized(false);
    }
  }, [run.messages]);

  const isEditable =
    run.status === "awaiting_input" &&
    messageUtils.isPlanMessage(
      run.messages[run.messages.length - 1]?.config.metadata
    );

  // Add state for tracking images from multimodal messages
  const [messageImages, setMessageImages] = useState<{
    urls: string[];
    titles: string[];
    messageIndices: number[];
    currentIndex?: number;
  }>({
    urls: [],
    titles: [],
    messageIndices: [],
  });

  // Function to collect images from multimodal messages for browser steps
  const collectImagesFromMessages = (messages: Message[]) => {
    const images: {
      urls: string[];
      titles: string[];
      messageIndices: number[];
      currentIndex?: number;
    } = {
      urls: [],
      titles: [],
      messageIndices: [],
    };

    let latestImageIndex = -1;

    messages.forEach((msg: Message, msgIndex: number) => {
      if (
        Array.isArray(msg.config.content) &&
        msg.config.metadata?.type === "browser_screenshot"
      ) {
        msg.config.content.forEach((item: any, itemIndex: number) => {
          if (typeof item === "object" && ("url" in item || "data" in item)) {
            const imageUrl =
              ("url" in item && item.url) ||
              ("data" in item && item.data
                ? `data:image/png;base64,${item.data}`
                : "");
            images.urls.push(imageUrl);
            images.messageIndices.push(msgIndex);
            latestImageIndex = images.urls.length - 1;
          }
          if (typeof item === "string") {
            images.titles.push(item);
          }
        });
      }
    });

    setMessageImages({
      ...images,
      currentIndex: latestImageIndex >= 0 ? latestImageIndex : undefined,
    });
  };

  // Update images when messages change
  useEffect(() => {
    collectImagesFromMessages(run.messages);
  }, [run.messages]);

  const handleMaximize = () => {
    setIsDetailViewerMinimized(false);
    setShowDetailViewer(true);
  };

  // Update handleImageClick to use the correct image index
  const handleImageClick = (messageIndex: number) => {
    const imageIndices = messageImages.messageIndices
      .map((msgIdx, imgIdx) => ({ msgIdx, imgIdx }))
      .filter(({ msgIdx }) => msgIdx === messageIndex)
      .map(({ imgIdx }) => imgIdx);

    if (imageIndices.length > 0) {
      const lastImageIndex = imageIndices[imageIndices.length - 1];
      setMessageImages((prev) => ({
        ...prev,
        currentIndex: lastImageIndex,
      }));
      handleMaximize();
    }
  };

  const handleToggleHide = async (messageIndex: number, expanded: boolean) => {
    // If a toggle operation is already in progress, ignore this request
    if (isTogglingRef.current) {
      console.log(
        "Something bad: Toggle operation already in progress, ignoring request"
      );
      return;
    }

    try {
      isTogglingRef.current = true;
      const newIndicesToHide = new Set();

      // Find the next significant message index
      let nextSignificantIndex = run.messages.length; // Default to end of messages
      for (let i = messageIndex + 1; i < run.messages.length; i++) {
        const msg = run.messages[i];
        const content = msg.config.content;

        // Check if this is a significant message that should stop the hiding
        if (
          typeof content === "string" &&
          (messageUtils.isFinalAnswer(msg.config.metadata) ||
            messageUtils.isPlanMessage(msg.config.metadata))
        ) {
          nextSignificantIndex = i;
          break;
        }

        // Check for messages with title and details that aren't duplicates
        if (
          messageUtils.isStepExecution(msg.config.metadata) &&
          typeof content === "string"
        ) {
          try {
            const currentStep = JSON.parse(content);
            if (currentStep.title && currentStep.details) {
              // Check if this step is a duplicate of any previous step
              const earlierMessages = run.messages.slice(0, i);
              const isDuplicate = earlierMessages.some(
                (earlierMsg: Message) => {
                  if (typeof earlierMsg.config.content !== "string")
                    return false;
                  try {
                    const earlierContent = JSON.parse(
                      earlierMsg.config.content
                    );
                    return (
                      earlierContent.title === currentStep.title &&
                      earlierContent.details === currentStep.details
                    );
                  } catch {
                    return false;
                  }
                }
              );

              if (!isDuplicate) {
                nextSignificantIndex = i;
                break;
              }
            }
          } catch {
            // If we can't parse the JSON, continue to next message
            continue;
          }
        }
      }

      // Update hidden states for messages between current and next significant message
      for (let i = messageIndex + 1; i < nextSignificantIndex; i++) {
        newIndicesToHide.add(i);
      }
      if (!expanded) {
        setHiddenMessageIndices((prevSet) => {
          const updatedSet = new Set(prevSet);
          newIndicesToHide.forEach((index: any) => updatedSet.add(index));
          return updatedSet;
        });
      } else {
        setHiddenMessageIndices((prevSet) => {
          const updatedSet = new Set(prevSet);
          newIndicesToHide.forEach((index: any) => updatedSet.delete(index));
          return updatedSet;
        });
      }
    } finally {
      // Always reset the toggling flag when done
      isTogglingRef.current = false;
    }
  };

  // Add this function to check if a message is a step execution
  const isStepExecution = (message: Message): boolean => {
    return messageUtils.isStepExecution(message.config.metadata);
  };

  // Add this effect to update repeated steps whenever messages change
  useEffect(() => {
    const newRepeatedIndices = new Set<number>();
    const newFailedIndices = new Set<number>();
    const newRepeatedHistory = new Map<number, number[]>();

    // For each message that is a step execution
    run.messages.forEach((msg: Message, msgIndex: number) => {
      if (!isStepExecution(msg)) return;

      try {
        const content = JSON.parse(String(msg.config.content));

        // Look for earlier messages with same step details
        const earlierMessages = run.messages.slice(0, msgIndex);
        const identicalStepIndices: number[] = [];

        // Find all identical steps
        earlierMessages.forEach((earlierMsg: Message, idx: number) => {
          if (typeof earlierMsg.config.content !== "string") return;
          try {
            const earlierContent = JSON.parse(earlierMsg.config.content);
            if (
              earlierContent.index === content.index &&
              earlierContent.title === content.title &&
              earlierContent.details === content.details
            ) {
              identicalStepIndices.push(idx);
            }
          } catch {
            return;
          }
        });

        // If we found identical steps, check for Final Answer or Plan after the last one
        if (identicalStepIndices.length > 0) {
          const messagesBetween = run.messages.slice(
            identicalStepIndices[identicalStepIndices.length - 1] + 1,
            msgIndex
          );

          const hasSeparator = messagesBetween.some((msg: Message) => {
            if (typeof msg.config.content !== "string") return false;
            return (
              messageUtils.isPlanMessage(msg.config.metadata) ||
              messageUtils.isFinalAnswer(msg.config.metadata)
            );
          });

          // Only mark as repeated if there's no separator
          if (!hasSeparator) {
            newRepeatedIndices.add(msgIndex);
            newRepeatedHistory.set(msgIndex, identicalStepIndices);
          }
        }

        // Separate step failure detection
        const nextMessages = run.messages.slice(msgIndex + 1);
        for (const nextMsg of nextMessages) {
          if (typeof nextMsg.config.content !== "string") continue;

          // If we find a step execution, plan, or final answer before finding "Replanning...", break
          try {
            if (messageUtils.isStepExecution(nextMsg.config.metadata)) break;
            if (messageUtils.isPlanMessage(nextMsg.config.metadata)) break;
            if (nextMsg.config.metadata?.type === "replanning") {
              newFailedIndices.add(msgIndex);
              break;
            }
          } catch {
            if (messageUtils.isFinalAnswer(nextMsg.config.metadata)) break;
          }
        }
      } catch {
        // Skip if we can't parse the message
      }
    });
    setRepeatedStepIndices(newRepeatedIndices);
    setFailedStepIndices(newFailedIndices);

    // handle auto-hiding of previous step execution messages
    const newHiddenStepExecutionIndices = new Set(hiddenStepExecutionIndices);
    // Process messages in order
    (async () => {
      for (let i = 0; i < run.messages.length; i++) {
        const msg: Message = run.messages[i];
        if (typeof msg.config.content !== "string") continue;

        try {
          // If this is a final answer, hide all previous step executions
          if (messageUtils.isFinalAnswer(msg.config.metadata)) {
            for (let j = 0; j < i; j++) {
              const prevMsg: Message = run.messages[j];
              if (typeof prevMsg.config.content === "string") {
                try {
                  if (messageUtils.isStepExecution(prevMsg.config.metadata)) {
                    newHiddenStepExecutionIndices.add(j);
                    handleToggleHide(j, false);
                    // delay for 100ms
                    await new Promise((resolve) => setTimeout(resolve, 100));
                  }
                } catch { }
              }
            }
            continue;
          }
          const content = JSON.parse(msg.config.content);

          // If this is a step execution that's not repeated
          if (
            messageUtils.isStepExecution(msg.config.metadata) &&
            !newRepeatedIndices.has(i)
          ) {
            // Hide all previous step executions
            for (let j = 0; j < i; j++) {
              const prevMsg: Message = run.messages[j];
              if (typeof prevMsg.config.content === "string") {
                try {
                  if (messageUtils.isStepExecution(prevMsg.config.metadata)) {
                    if (!newRepeatedIndices.has(j)) {
                      handleToggleHide(j, false);
                      newHiddenStepExecutionIndices.add(j);
                      // delay for 100ms
                      await new Promise((resolve) => setTimeout(resolve, 100));
                    }
                  }
                } catch { }
              }
            }
          }
        } catch { }
      }

      if (
        newHiddenStepExecutionIndices.size > 0 &&
        newHiddenStepExecutionIndices !== hiddenStepExecutionIndices
      ) {
        setHiddenStepExecutionIndices((prevSet) => {
          const updatedSet = new Set(prevSet);
          for (const index of newHiddenStepExecutionIndices) {
            updatedSet.add(index);
          }
          return updatedSet;
        });
      }
    })();
  }, [run.messages]);

  useEffect(() => {
    if (!run.messages.length) return;

    const updatedMessages = [...run.messages];

    updatedMessages.forEach((msg: Message, idx: number) => {
      if (idx === 0) return;

      const userPlans = messageUtils.findUserPlan(msg.config.content);

      // Check if this is a user message with a plan
      if (messageUtils.isUser(msg.config.source) && userPlans.length > 0) {
        const prevIdx = idx - 1;
        const prevMsg = updatedMessages[prevIdx];

        // Check if previous message is a plan
        if (prevMsg && messageUtils.isPlanMessage(prevMsg.config.metadata)) {
          try {
            // Create a new message object with updated content
            const updatedContent = messageUtils.updatePlan(
              prevMsg.config.content,
              userPlans
            );

            if (updatedContent !== prevMsg.config.content) {
              updatedMessages[prevIdx] = {
                ...prevMsg,
                config: {
                  ...prevMsg.config,
                  content: updatedContent,
                  version: (prevMsg.config.version || 0) + 1,
                },
              };
            }
          } catch (error) {
            console.error(
              `Error updating plan for message at index ${prevIdx}:`,
              error
            );
          }
        }
      }
    });

    setLocalMessages(updatedMessages);
  }, [run.messages]);

  // Update useEffect to find the last plan message
  useEffect(() => {
    let lastIdx = -1;
    run.messages.forEach((msg: Message, idx: number) => {
      if (
        typeof msg.config.content === "string" &&
        messageUtils.isPlanMessage(msg.config.metadata)
      ) {
        lastIdx = idx;
      }
    });
    setLastPlanIndex(lastIdx);
  }, [run.messages]);

  // Add this effect to handle scrolling when status changes
  useEffect(() => {
    if (run.status === "awaiting_input" && buttonsContainerRef.current) {
      // Use a small delay to ensure the DOM has updated
      setTimeout(() => {
        buttonsContainerRef.current?.scrollIntoView({
          behavior: "smooth",
          block: "nearest",
        });
      }, 100);
    }
  }, [run.status]);

  const onDeleteSteps = (steps: string[]) => {
    onExecuteCommand?.("delete " + steps.join(","));
  }

  const onSwitchWorkflow = (workflow: string) => {
    onExecuteCommand?.("workflow " + workflow);
  }

  const onCreateWorkflow = (workflow: string) => {
    onExecuteCommand?.("workflow " + workflow);
  }

  const onRunWorkflow = (workflow: string) => {
    onExecuteCommand?.("run " + workflow);
  }

  const onDownloadWorkspace = (format: string, generalized: boolean) => {
    const guid = uuidv4();
    let filename = guid;
    if (format === "python") {
      filename = `${guid}/workspace.py`;
    } else if (format === "json") {
      filename = `${guid}/workspace.json`;
    }
    onExecuteCommand?.(`save_as ${filename} ${generalized} ${format}`);
  };

  const onToggleRecording = () => {
    onExecuteCommand?.("browser");
  }

  return (
    <div
      className="flex w-full gap-4 h-full overflow-y-auto scroll"
      ref={threadContainerRef}
    >
      {/* Messages section */}
      <div
        className={`items-start relative flex flex-col h-full ${showDetailViewer &&
          novncEndpoint !== undefined &&
          !isDetailViewerMinimized
          ? detailViewerExpanded
            ? "w-0"
            : "w-[40%]"
          : "w-full"
          } transition-all duration-300`}
      >
        {/* Thread Section - use flex-1 for height, but remove overflow-y-auto */}
        <div className="w-full flex-1">
          <WorkspaceDisplay
            workspace={workspace}
            currentWorkflow={currentWorkflow}
            runStatus={run.status}
            onDeleteSteps={onDeleteSteps}
            onSwitchWorkflow={onSwitchWorkflow}
            onCreateWorkflow={onCreateWorkflow}
            onRunWorkflow={onRunWorkflow}
            onDownloadWorkspace={onDownloadWorkspace}
          />
        </div>

        {/* ChatInput - use sticky positioning to keep at bottom with full width */}
        <div
          ref={buttonsContainerRef}
          className="sticky bottom-0 flex-shrink-0 w-full bg-background"
          style={{
            width: "100%", // Always take full width of parent
          }}
        >
          <ChatInput
            ref={chatInputRef}
            onSubmit={(
              query: string,
            ) => {
              onExecuteCommand?.(query);
            }}
            error={error ?? null}
            onCancel={onCancel}
            runStatus={run.status}
            onPause={onPause}
            enable_upload={enable_upload}
            inputRequest={run.input_request}
            extractingResult={extractingResult}
          />
        </div>
      </div>

      {/* Detail Viewer section */}
      {isDetailViewerMinimized && novncEndpoint !== undefined && (
        <button
          onClick={() => setIsDetailViewerMinimized(false)}
          className="self-start sticky top-0 h-full inline-flex text-magenta-800 hover:text-magenta-900 cursor-pointer"
          title="Show browser"
        >
          <Globe2 size={20} />
        </button>
      )}

      {showDetailViewer &&
        novncEndpoint !== undefined &&
        !isDetailViewerMinimized && (
          <div
            className={`${detailViewerExpanded ? "w-full" : "w-[60%]"
              } self-start sticky top-0 h-full`}
          >
            <div className="h-full flex-1">
              <DetailViewer
                images={messageImages.urls}
                imageTitles={messageImages.titles}
                onMinimize={() => setIsDetailViewerMinimized(true)}
                onToggleExpand={() =>
                  setDetailViewerExpanded(!detailViewerExpanded)
                }
                isExpanded={detailViewerExpanded}
                currentIndex={messageImages.currentIndex || 0}
                onIndexChange={(index: number) =>
                  setMessageImages((prev) => ({
                    ...prev,
                    currentIndex: index,
                  }))
                }
                novncEndpoint={novncEndpoint}
                novncProtocol={novncProtocol}
                onPause={onPause}
                runStatus={run.status}
                detailViewerContainerId={DETAIL_VIEWER_CONTAINER_ID}
                recordingStatus={recordStatus}
                onToggleRecording={onToggleRecording}
              />
            </div>
          </div>
        )}
    </div>
  );
};

export default RunView;
