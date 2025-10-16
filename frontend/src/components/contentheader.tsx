import React from "react";
import { Plus } from "lucide-react";
import { Tooltip } from "antd";
import { useConfigStore } from "../hooks/store";
import logo from "../assets/logo.svg";
import { Button } from "./common/Button";

type ContentHeaderProps = {
  onNewSession: () => void;
};

const ContentHeader = ({
  onNewSession,
}: ContentHeaderProps) => {
  useConfigStore();

  return (
    <div className="sticky top-0 bg-primary">
      <div className="flex h-16 items-center justify-between">
        {/* Left side: Text and Sidebar Controls */}
        <div className="flex items-center">
          {/* New Session Button */}
          <div className="w-[40px]">
            <Tooltip title="Create new agent session">
              <Button
                variant="tertiary"
                size="sm"
                icon={<Plus className="w-6 h-6" />}
                onClick={onNewSession}
                className="transition-colors hover:text-accent"
              />
            </Tooltip>
          </div>
          <div className="flex items-center space-x-2">
            <div className="text-primary text-2xl font-bold">Action Engine Agent</div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default ContentHeader;
