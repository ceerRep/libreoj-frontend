import React, { PropsWithChildren, useState, useRef, useCallback, useEffect } from "react";
import { Header, Menu, Button, Checkbox, Icon } from "semantic-ui-react";
import { observer } from "mobx-react";

import style from "./SubmitViewFrame.module.less";

import { useLocalizer, Link, useScreenWidthWithin } from "@/utils/hooks";
import StatusText from "@/components/StatusText";
import ScoreText from "@/components/ScoreText";

interface SubmitViewFrameProps {
  showSkipSamples: boolean;
  mainContent: React.ReactNode;
  sidebarContent: React.ReactNode;
  submitDisabled: boolean;
  onGetSubmitFile?: () => Promise<Blob>;

  inSubmitView: boolean;
  pendingSubmit: boolean;
  lastSubmission: ApiTypes.ProblemLastSubmissionDto;
  submissionContent: unknown;
  onCloseSubmitView: () => void;
  onUpdateSubmissionContent: (path: string, value: unknown) => void;
  onSubmit: (onGetSubmitFile?: () => Promise<Blob>) => void;
  layoutMode?: "default" | "sidebar";
  hideSkipSamples?: boolean;
  additionalActions?: React.ReactNode;
}

let SubmitViewFrame: React.FC<SubmitViewFrameProps> = props => {
  const _ = useLocalizer("problem");
  const isMobile = useScreenWidthWithin(0, 768);

  // Bottom panel resizing logic
  const [bottomPanelHeight, setBottomPanelHeight] = useState(isMobile ? 240 : 120);
  const [isResizingBottom, setIsResizingBottom] = useState(false);
  const [isBottomCollapsed, setIsBottomCollapsed] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (isMobile) {
      setBottomPanelHeight(240);
    } else {
      setBottomPanelHeight(120);
    }
  }, [isMobile]);

  const startResizingBottom = useCallback((event: React.MouseEvent | React.TouchEvent) => {
    setIsResizingBottom(true);
    // Prevent default behavior to avoid scrolling on touch devices
    if (event.cancelable) event.preventDefault();

    const clientY = 'touches' in event ? event.touches[0].clientY : event.clientY;
    const startY = clientY;
    const startHeight = bottomPanelHeight;

    const onMove = (moveEvent: MouseEvent | TouchEvent) => {
        const currentY = 'touches' in moveEvent ? moveEvent.touches[0].clientY : (moveEvent as MouseEvent).clientY;
        const deltaY = startY - currentY;
        const newHeight = startHeight + deltaY;
        
        // 允许高度调整，但如果不折叠，最小高度设为 30px
        if (newHeight >= 30 && newHeight < 600) {
             setBottomPanelHeight(newHeight);
             setIsBottomCollapsed(false);
        } else if (newHeight < 30) {
             setBottomPanelHeight(30);
             setIsBottomCollapsed(true);
        }
    };

    const onEnd = () => {
      setIsResizingBottom(false);
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onEnd);
      window.removeEventListener("touchmove", onMove);
      window.removeEventListener("touchend", onEnd);
    };

    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onEnd);
    window.addEventListener("touchmove", onMove, { passive: false });
    window.addEventListener("touchend", onEnd);
  }, [bottomPanelHeight]);

  const toggleBottomCollapse = () => {
      if (isBottomCollapsed) {
          setBottomPanelHeight(isMobile ? 240 : 120);
          setIsBottomCollapsed(false);
      } else {
          setBottomPanelHeight(30);
          setIsBottomCollapsed(true);
      }
  }

  if (props.layoutMode === "sidebar") {
    return (
      <div className={style.sidebarMode} ref={containerRef}>
        <div className={style.sidebarEditor} style={{ flexGrow: 1, height: `calc(100% - ${bottomPanelHeight}px)` }}>
          {props.mainContent}
        </div>
        
        <div 
            className={`${style.resizer} ${isResizingBottom ? style.resizing : ""}`}
            onMouseDown={startResizingBottom}
            onTouchStart={startResizingBottom}
        />

        <div className={style.bottomPanel} style={{ height: bottomPanelHeight }}>
            <div className={style.bottomPanelHeader} onTouchStart={startResizingBottom} onMouseDown={startResizingBottom}>
                 <div className={style.tabTitle} onClick={(e) => { e.stopPropagation(); toggleBottomCollapse(); }}>
                    <Icon name={isBottomCollapsed ? "angle up" : "angle down"} />
                    选项
                 </div>
            </div>
            {!isBottomCollapsed && (
                <div className={style.bottomPanelContent}>
                    <div className={style.optionsContainer}>
                        <div className={style.languageSection}>
                            {props.sidebarContent}
                        </div>
                        {props.additionalActions && (
                            <div className={style.actionsSection}>
                                {props.additionalActions}
                            </div>
                        )}
                    </div>
                </div>
            )}
        </div>
      </div>
    );
  }

  return (
    <div className={style.submitView} style={{ display: props.inSubmitView ? null : "none" }}>
      <div className={style.leftContainer}>{props.mainContent}</div>
      <div className={style.rightContainer}>
        <Menu pointing secondary vertical className={style.actionMenu}>
          <Menu.Item name={_(".submit.back_to_statement")} icon="arrow left" onClick={props.onCloseSubmitView} />
          <div />
        </Menu>
        {props.sidebarContent}
        {props.showSkipSamples && (
          <Checkbox
            className={style.skipSamples}
            label={_(".submit.skip_samples")}
            checked={(props.submissionContent as any).skipSamples}
            onChange={(e, { checked }) => props.onUpdateSubmissionContent("skipSamples", checked)}
          />
        )}
        <Button
          className={style.submitButton}
          primary
          fluid
          icon="paper plane"
          loading={props.pendingSubmit}
          disabled={props.submitDisabled}
          content={_(".submit.submit")}
          onClick={() => props.onSubmit(props.onGetSubmitFile)}
        />
        {props.lastSubmission && props.lastSubmission.lastSubmission && (
          <div className={style.lastSubmission}>
            <Header size="tiny" content={_(".submit.last_submission")} />
            <Link href={`/s/${props.lastSubmission.lastSubmission.id}`}>
              <StatusText status={props.lastSubmission.lastSubmission.status} />
            </Link>
            <Link className={style.scoreText} href={`/s/${props.lastSubmission.lastSubmission.id}`}>
              <ScoreText score={props.lastSubmission.lastSubmission.score || 0} />
            </Link>
          </div>
        )}
      </div>
    </div>
  );
};

SubmitViewFrame = observer(SubmitViewFrame);

interface EditorWrapperProps {
  disabled?: boolean;
}

const EditorWrapper: React.FC<PropsWithChildren<EditorWrapperProps>> = props => {
  return <div className={style.editorWrapper + (props.disabled ? " " + style.disabled : "")}>{props.children}</div>;
};

export default Object.assign(SubmitViewFrame, {
  EditorWrapper
});
