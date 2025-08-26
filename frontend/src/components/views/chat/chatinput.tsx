import { PauseCircleIcon, } from "@heroicons/react/24/outline";
import * as React from "react";
import { appContext } from "../../../hooks/provider";
import { IStatus } from "../../types/app";
import {
  Upload,
  message,
  Button,
  Tooltip,
  notification,
  Modal,
  Input,
  Dropdown,
  Menu,
  Spin,
} from "antd";
import type { UploadFile, UploadProps, RcFile } from "antd/es/upload/interface";
import { CornerDownLeftIcon } from "lucide-react";
import { InputRequest, Workspace } from "../../types/datamodel";

// Maximum file size in bytes (5MB)
const MAX_FILE_SIZE = 5 * 1024 * 1024;

// Threshold for large text files (in characters)
const LARGE_TEXT_THRESHOLD = 1500;

interface ChatInputProps {
  onSubmit: (
    text: string,
  ) => void;
  error: IStatus | null;
  disabled?: boolean;
  onCancel?: () => void;
  runStatus?: string;
  inputRequest?: InputRequest;
  onPause?: () => void;
  enable_upload?: boolean;
  extractingResult: string | null;
}

const ChatInput = React.forwardRef<{ focus: () => void }, ChatInputProps>(
  (
    {
      onSubmit,
      error,
      disabled = false,
      onCancel,
      runStatus,
      inputRequest,
      onPause,
      enable_upload = false,
      extractingResult
    },
    ref
  ) => {
    const [selectedCommand, setSelectedCommand] = React.useState<string>("act");
    const [isExtractingModalOpen, setIsExtractingModalOpen] = React.useState(false);
    const [currentExtractingTerm, setCurrentExtractingTerm] = React.useState<string | null>(null);
    const [currentExtractingResult, setCurrentExtractingResult] = React.useState<string | null>(null);
    const textAreaRef = React.useRef<HTMLTextAreaElement>(null);
    const textAreaDivRef = React.useRef<HTMLDivElement>(null);
    const [text, setText] = React.useState("");
    const [fileList, setFileList] = React.useState<UploadFile[]>([]);
    const [dragOver, setDragOver] = React.useState(false);
    const { darkMode, user } = React.useContext(appContext) as {
      darkMode: string;
      user: { email: string };
    };
    const [notificationApi, notificationContextHolder] =
      notification.useNotification();
    const [isRelevantPlansVisible, setIsRelevantPlansVisible] =
      React.useState(false);
    const textAreaDefaultHeight = "64px";
    const isInputDisabled =
      disabled ||
      runStatus === "active" ||
      runStatus === "pausing" ||
      inputRequest?.input_type === "approval";

    // Handle textarea auto-resize
    React.useEffect(() => {
      if (textAreaRef.current) {
        textAreaRef.current.style.height = textAreaDefaultHeight;
        const scrollHeight = textAreaRef.current.scrollHeight;
        textAreaRef.current.style.height = `${scrollHeight}px`;
      }
      if (textAreaDivRef.current) {
        textAreaDivRef.current.style.height = textAreaDefaultHeight;
        const scrollHeight = textAreaDivRef.current.scrollHeight;
        textAreaDivRef.current.style.height = `${scrollHeight}px`;
      }
    }, [text, inputRequest]);

    React.useEffect(() => {
      if (!error) {
        resetInput();
      }
    }, [error]);

    React.useEffect(() => {
      if (!isInputDisabled && textAreaRef.current) {
        textAreaRef.current.focus();
      }
    }, [isInputDisabled]);

    // Add paste event listener for images and large text
    const handlePaste = (e: React.ClipboardEvent<HTMLTextAreaElement>) => {
      if (isInputDisabled || !enable_upload) return;

      // Handle image paste
      if (e.clipboardData?.items) {
        let hasImageItem = false;

        for (let i = 0; i < e.clipboardData.items.length; i++) {
          const item = e.clipboardData.items[i];

          // Handle image items
          if (item.type.indexOf("image/") === 0) {
            hasImageItem = true;
            const file = item.getAsFile();

            if (file && file.size <= MAX_FILE_SIZE) {
              // Prevent the default paste behavior for images
              e.preventDefault();

              // Create a unique file name
              const fileName = `pasted-image-${new Date().getTime()}.png`;

              // Create a new File with a proper name
              const namedFile = new File([file], fileName, {
                type: file.type,
              });

              // Convert to the expected UploadFile format
              const uploadFile: UploadFile = {
                uid: `paste-${Date.now()}`,
                name: fileName,
                status: "done",
                size: namedFile.size,
                type: namedFile.type,
                originFileObj: namedFile as RcFile,
              };

              // Add to file list
              setFileList((prev) => [...prev, uploadFile]);

              // Show successful paste notification
              message.success(`Image pasted successfully`);
            } else if (file && file.size > MAX_FILE_SIZE) {
              message.error(`Pasted image is too large. Maximum size is 5MB.`);
            }
          }

          // Handle text items - only if there's a large amount of text
          if (item.type === "text/plain" && !hasImageItem) {
            item.getAsString((text) => {
              // Only process for large text
              if (text.length > LARGE_TEXT_THRESHOLD) {
                // We need to prevent the default paste behavior
                // But since we're in an async callback, we need to
                // manually clear the textarea's selection value
                setTimeout(() => {
                  if (textAreaRef.current) {
                    const currentValue = textAreaRef.current.value;
                    const selectionStart =
                      textAreaRef.current.selectionStart || 0;
                    const selectionEnd = textAreaRef.current.selectionEnd || 0;

                    // Remove the pasted text from the textarea
                    const newValue =
                      currentValue.substring(0, selectionStart - text.length) +
                      currentValue.substring(selectionEnd);

                    // Update the textarea
                    textAreaRef.current.value = newValue;
                    // Trigger the onChange event manually
                    setText(newValue);
                  }
                }, 0);

                // Prevent default paste for large text
                e.preventDefault();

                // Create a text file from the pasted content
                const blob = new Blob([text], { type: "text/plain" });
                const file = new File(
                  [blob],
                  `pasted-text-${new Date().getTime()}.txt`,
                  { type: "text/plain" }
                );

                // Add to file list
                const uploadFile: UploadFile = {
                  uid: `paste-${Date.now()}`,
                  name: file.name,
                  status: "done",
                  size: file.size,
                  type: file.type,
                  originFileObj: file as RcFile,
                };

                setFileList((prev) => [...prev, uploadFile]);

                // Notify user about the conversion
                notificationApi.info({
                  message: (
                    <span className="text-sm">
                      Large Text Converted to File
                    </span>
                  ),
                  description: (
                    <span className="text-sm text-secondary">
                      Your pasted text has been attached as a file.
                    </span>
                  ),
                  duration: 3,
                });
              }
            });
          }
        }
      }
    };

    const resetInput = () => {
      if (textAreaRef.current) {
        textAreaRef.current.value = "";
        textAreaRef.current.style.height = textAreaDefaultHeight;
        setText("");
      }
      if (textAreaDivRef.current) {
        textAreaDivRef.current.style.height = textAreaDefaultHeight;
      }
    };

    const handleTextChange = (event: React.ChangeEvent<HTMLTextAreaElement>) => {
      const newText = event.target.value;
      setText(newText);
    };

    const submitInternal = (
      query: string,
      doResetInput: boolean = true
    ) => {
      onSubmit(query);
      if (doResetInput) {
        resetInput();
      }
      textAreaRef.current?.focus();
    };

    const handleSubmit = () => {
      if (
        (textAreaRef.current?.value) &&
        !isInputDisabled
      ) {
        const query = textAreaRef.current?.value || "";
        submitInternal(query);
      }
    };

    const handleBySubmitting = (query: string) => {
      if (!isInputDisabled) {
        submitInternal(query);
      }
    };

    const onLoadWorkspace = (file: File) => {
      //submitInternal("load workspace", [], false);
      const reader = new FileReader();
      reader.onload = (event) => {
        const content = event.target?.result as string;
        if (content) {
          submitInternal("loadj " + JSON.stringify(content));
        } else {
          console.error("Failed to read file content.");
        }
      };

      reader.onerror = () => {
        console.error("Error reading file:", reader.error);
      };

      reader.readAsText(file);
    };

    const handlePause = () => {
      if (onPause) {
        onPause();
      }
    };

    const handleExecute = () => {
      if (
        (textAreaRef.current?.value) &&
        !isInputDisabled
      ) {
        const query = textAreaRef.current?.value || "";

        if (!selectedCommand) {
          message.error("Please select a command before performing the action.");
          return;
        }

        // If extract, open the progress modal before kicking off the run
        if (selectedCommand === "extract") {
          setCurrentExtractingResult(null)
          setCurrentExtractingTerm(query);
          setIsExtractingModalOpen(true);
        }

        // Execute the command
        submitInternal(`${selectedCommand} "${query}"`);

        // Reset command back to "act" for next time
        //setSelectedCommand("act");
      }
    };

    const handleReExtract = (term: string) => {
      if (!isInputDisabled) {
        setCurrentExtractingResult(null)
        setCurrentExtractingTerm(term);
        submitInternal(`extract "${term}"`);
      }
    };

    const handleGenerateCode = () => {
      if (!isInputDisabled) {
        submitInternal("gencode");
      }
    }

    const handleKeyDown = (event: React.KeyboardEvent<HTMLTextAreaElement>) => {
      if (event.key === "Enter" && !event.shiftKey) {
        event.preventDefault();
        handleExecute();
      }
    };

    // Expose focus method via ref
    React.useImperativeHandle(ref, () => ({
      focus: () => {
        textAreaRef.current?.focus();
      },
    }));

    React.useEffect(() => {
      setCurrentExtractingResult(extractingResult);
    }, [extractingResult]);

    React.useEffect(() => {
      const handleClickOutside = (e: MouseEvent) => {
        // Only process if dropdown is visible
        if (!isRelevantPlansVisible) return;

        // Get the clicked element
        const target = e.target as Node;

        // Check if click was on textarea or within the plans dropdown
        const textAreaElement = textAreaRef.current;
        const planElement = document.querySelector(
          '[data-component="relevant-plans"]'
        );

        const isClickInsideTextArea =
          textAreaElement && textAreaElement.contains(target);
        const isClickInsidePlans = planElement && planElement.contains(target);

        // Hide dropdown if click is outside both elements
        if (!isClickInsideTextArea && !isClickInsidePlans) {
          setIsRelevantPlansVisible(false);
        }
      };

      // Handle escape key
      const handleKeyDown = (e: KeyboardEvent) => {
        if (e.key === "Escape" && isRelevantPlansVisible) {
          setIsRelevantPlansVisible(false);
        }
      };

      // Add listeners
      document.addEventListener("click", handleClickOutside);
      document.addEventListener("keydown", handleKeyDown);

      return () => {
        document.removeEventListener("click", handleClickOutside);
        document.removeEventListener("keydown", handleKeyDown);
      };
    }, [isRelevantPlansVisible]);

    return (
      <div className="mt-2 w-full relative">
        {notificationContextHolder}

        <div className="mt-2 rounded shadow-sm flex">
          <div className={`flex w-full ${dragOver ? "opacity-50" : ""}`}>
            <div className="flex w-full">
              <div className="flex-1">
                <form
                  onSubmit={(e) => {
                    e.preventDefault();
                    handleSubmit();
                  }}
                  className="flex"
                >
                  {/* Dropdown for command */}
                  <select
                    id="commandSelect"
                    name="commandSelect"
                    value={selectedCommand}
                    onChange={(e) => setSelectedCommand(e.target.value)}
                    disabled={isInputDisabled}
                    className={`text-center border-l border-t border-b border-r border-accent p-2 rounded-l-lg ${darkMode === "dark"
                      ? "bg-[#333333] text-white"
                      : "bg-white text-black"
                      } ${isInputDisabled ? "cursor-not-allowed" : ""} focus:outline-none`}
                  >
                    <option value="" disabled>
                      Command:
                    </option>
                    <option value="act">ACT</option>
                    <option value="goto">GOTO</option>
                    <option value="extract">EXTRACT</option>
                  </select>

                  {/* Textarea for arguments */}
                  <textarea
                    id="queryInput"
                    name="queryInput"
                    onPaste={handlePaste}
                    ref={textAreaRef}
                    defaultValue=""
                    onChange={handleTextChange}
                    onKeyDown={handleKeyDown}
                    className={`flex items-center w-full resize-none border-t border-b border-accent p-2 ${darkMode === "dark"
                      ? "bg-[#444444] text-white"
                      : "bg-white text-black"
                      } ${isInputDisabled ? "cursor-not-allowed" : ""} focus:outline-none leading-[50px]`}
                    style={{
                      height: "50px",
                      overflowY: "hidden",
                      resize: "none",
                    }}
                    placeholder={
                      selectedCommand === "goto"
                        ? "Enter website URL"
                        : selectedCommand === "act"
                          ? "What do you want to do?"
                          : selectedCommand === "extract"
                            ? "Explain data you want to extract"
                            : "Select a command first..."
                    }
                    disabled={isInputDisabled}
                  />
                </form>
              </div>

              {/* Action buttons */}
              <div
                className={`flex items-center justify-center gap-2 border-t border-r border-b border-accent px-2 rounded-r-lg ${darkMode === "dark"
                  ? "bg-[#444444] text-white"
                  : "bg-white text-black"
                  }`}
              >
                {runStatus === "active" && (
                  <button
                    type="button"
                    onClick={handlePause}
                    className="bg-magenta-800 hover:bg-magenta-900 text-white rounded flex justify-center items-center w-11 h-9 transition duration-300"
                  >
                    <PauseCircleIcon className="h-6 w-6" />
                  </button>
                )}
                <Tooltip title="Perform Action">
                  <button
                    type="button"
                    onClick={handleExecute}
                    disabled={isInputDisabled}
                    className={`bg-magenta-800 transition duration-300 rounded flex justify-center items-center w-11 h-9 ${isInputDisabled ? "cursor-not-allowed" : "hover:bg-magenta-900"}`}
                  >
                    <CornerDownLeftIcon className="h-6 w-6 text-white" />
                  </button>
                </Tooltip>
              </div>
            </div>
          </div>
        </div>
        <Modal
          title={currentExtractingResult == null ? "Extracting data" : "Result"}
          open={isExtractingModalOpen}
          width={800}
          onCancel={() => {
            // Allow closing only when we're showing the result
            if (currentExtractingResult != null) {
              setIsExtractingModalOpen(false);
            }
          }}
          footer={
            !isInputDisabled ? (
              <div className="flex flex-col sm:flex-row gap-3 items-center text-black w-full">
                {/* 1) Text box for new extract term */}
                <input
                  type="text"
                  placeholder="Enter new extract term"
                  disabled={isInputDisabled}
                  value={currentExtractingTerm != null ? currentExtractingTerm : ""}
                  onChange={(e) => setCurrentExtractingTerm(e.target.value)}
                  className="border rounded px-3 py-2 flex-1"
                />

                {/* 2) Re-extract button */}
                <button
                  className="bg-magenta-800 hover:bg-magenta-900 text-white rounded px-4 py-2"
                  disabled={isInputDisabled}
                  onClick={() => {
                    if (currentExtractingTerm != null && currentExtractingTerm.trim()) {
                      handleReExtract(currentExtractingTerm);
                    }
                  }}
                >
                  Re-Extract
                </button>

                {/* 3) Generate Extracting Code button */}
                <button
                  className="bg-magenta-800 hover:bg-magenta-900 text-white rounded px-4 py-2"
                  disabled={isInputDisabled}
                  onClick={() => {
                    handleGenerateCode();
                  }}
                >
                  Generate Code
                </button>

              </div>
            ) : null
          }

          closable={currentExtractingResult != null}
        >
          {isInputDisabled ? (currentExtractingResult == null ?
            (
              <div className="flex items-center gap-3 py-4">
                <Spin />
                <span>Extracting "<em>{currentExtractingTerm}</em>" from the current page. <br />This may take a moment…</span>
              </div>
            ) : (
              <div className="flex items-center gap-3 py-4">
                <Spin />
                <span>Generating extraction code for "<em>{currentExtractingTerm}</em>". <br />This may take a moment…</span>
              </div>
            )
          ) : (
            <div className="py-2">
              {currentExtractingResult ? (
                // Render as preformatted text; adjust to your result shape
                <pre className={`${darkMode === "dark" ? "text-white" : "text-black"} whitespace-pre-wrap`}>
                  {typeof currentExtractingResult === "string" ? currentExtractingResult : JSON.stringify(currentExtractingResult, null, 2)}
                </pre>
              ) : (
                <span>No extract result was returned.</span>
              )}
            </div>
          )}
        </Modal>
      </div>
    );
  }
);

export default ChatInput;
