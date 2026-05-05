import React, { useState, useEffect } from "react";

interface SampleTasksProps {
  onSelect: (task: string) => void;
}

/*
const SAMPLE_TASKS = [
  "When does the post office near me close today?",
  "Find the latest publications from the the Microsoft Research AI Frontiers Lab on Human-Agent interaction",
  "Which commit of Microsoft/markitdown repo introduced MCP support?",
  "Can you make a Markdown file with python that summarizes the Microsoft AutoGen repo?",
  "Order me a custom pizza from Tangle Town Pub with sausage, pineapple, and black olives",
  "Search arXiv for the latest papers on computer use agents",
];
*/
/*
const SAMPLE_TASKS = [
  "Find a recipe for a vegetarian lasagna that has at least a four-star rating on https://www.allrecipes.com/.",
  "Discover a suitable chocolate cupcake recipe on https://www.allrecipes.com that has a preparation time of under 1 hour.",
  "Find out the starting price for the most recent model of the iMac on https://apple.com.",
  "Check if there are trade-in offers for the latest model of iPhone on https://apple.com.",
];
*/
const SAMPLE_TASKS = [
  "Change my Reddit bio to \"Pro Python Developer with 20 years of Experience\" on http://4.236.122.196:9999/",
];

const SampleTasks: React.FC<SampleTasksProps> = ({ onSelect }) => {
  const [isExpanded, setIsExpanded] = useState(false);
  const [windowWidth, setWindowWidth] = useState(0);

  useEffect(() => {
    const handleResize = () => setWindowWidth(window.innerWidth);
    handleResize(); // Initial width
    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, []);

  const isLargeScreen = windowWidth >= 1024; // lg breakpoint
  const tasksPerRow = windowWidth >= 640 ? 2 : 1; // 2 columns on sm, 1 on mobile
  const defaultVisibleTasks = tasksPerRow * 2;
  const maxVisibleTasks = isLargeScreen
    ? SAMPLE_TASKS.length
    : isExpanded
    ? SAMPLE_TASKS.length
    : defaultVisibleTasks;
  const visibleTasks = SAMPLE_TASKS.slice(0, maxVisibleTasks);
  const shouldShowToggle =
    !isLargeScreen && SAMPLE_TASKS.length > defaultVisibleTasks;

  return (
    <div className="mb-6">
      <div className="mt-4 mb-2 text-sm opacity-70 text-secondary">
        or try a sample task from below{" "}
      </div>
      <div className="flex flex-col gap-2 w-full">
        <div className="inline-flex flex-wrap justify-center gap-2 w-full">
          {visibleTasks.map((task, idx) => (
            <button
              key={idx}
              className="max-w-80 rounded px-4 py-2 text-left transition-colors text-primary hover:bg-secondary bg-tertiary"
              onClick={() => onSelect(task)}
              type="button"
            >
              {task}
            </button>
          ))}
        </div>
        {shouldShowToggle && (
          <button
            className="text-primary hover:text-secondary transition-colors text-sm font-medium mt-1"
            onClick={() => setIsExpanded(!isExpanded)}
            type="button"
          >
            {isExpanded ? "Show less..." : "Show more sample tasks..."}
          </button>
        )}
      </div>
    </div>
  );
};

export default SampleTasks;
