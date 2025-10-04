import json
import logging
import os
from typing import List, Literal, Optional

import yaml
from pydantic import BaseModel, Field, model_validator
from yamlable import YamlAble, yaml_info

LOGGER = logging.getLogger(__name__)

ALLOWED_MATCH_TYPES = ["exact", "substring", "prefix", "suffix", "regex", "unknown"]
ALLOWED_WHERE_TYPES = ["url", "button", "textbox", "label", "text", "heading", "link", "unknown"]


def convert_action_type(action_type: str) -> str:
    if action_type == "history_back":
        return "back"
    elif action_type == "history_forward":
        return "forward"
    elif action_type == "FinalValidation":
        return "generate_answer"
    elif action_type == "type":
        return "input"
    elif action_type == "keypress":
        return "press"
    elif action_type == "double_click":
        return "doubleclick"
    else:
        return action_type


# private classes
@yaml_info(yaml_tag_ns="com.project24.schema")
class TextMarker(BaseModel, YamlAble):
    """A text marker describes a string pattern that matches what appear in a UI element"""

    model_config = {
        "validate_assignment": True,
        "validate_default": True,
    }

    text: str = Field(description="a text pattern to match")
    match_type: Literal["exact", "substring", "prefix", "suffix", "regex", "unknown"] = Field(description="match type")
    where: Literal["url", "button", "textbox", "label", "text", "heading", "link", "unknown"] = Field(
        description="location where the text pattern appears", default="unknown"
    )
    element_id: str = Field(
        description="a numeric id that appear as red numbers inside red circles next to UI element where "
        "the marker appears. MUST be extracted from the given image."
    )

    @staticmethod
    def create(**kwargs):
        tm = TextMarker(text="", match_type="unknown", where="unknown", element_id="")
        for key, value in kwargs.items():
            setattr(tm, key, value)
        return tm

    @model_validator(mode="before")
    @classmethod
    def validate_fields(cls, values):
        # Validate match_type
        if "match_type" in values:
            if values["match_type"] not in ALLOWED_MATCH_TYPES:
                values["match_type"] = "unknown"

        # Validate where
        if "where" in values:
            if values["where"] not in ALLOWED_WHERE_TYPES:
                values["where"] = "unknown"

        return values

    _hash = None

    def get_hash(self) -> str:
        if not self._hash:
            self._hash = hash(f"{self.text}:{self.where}")
        return self._hash


@yaml_info(yaml_tag_ns="com.project24.schema")
class Action(BaseModel, YamlAble):
    """An Action is the smallest unit of UI action that a human or an agent can perform"""

    type: Literal[
        "call_plugin",
        "goto",
        "read_text",
        "click",
        "hover",
        "fill",
        "press",
        "selectoption",
        "check",
        "uncheck",
        "generate_answer",
        "unknown",
        "back",
        "input",
        "drag",
        "doubleclick",
    ] = Field(description="action type")
    input: Optional[List[str]] = Field(
        description=(
            "list of input parameters if the the action type needs any (e.g., 'fill' action needs a text input). "
            "An input may come from a variable, whose name is prefixed with '@'. Many action types, e.g., a 'click', "
            "do not need inputs."
        )
    )
    element_id: Optional[str] = Field(description="a numeric id of the HTML element on which the action is performed")
    output: Optional[str] = Field(description="output variable name")
    selector: Optional[List[str]] = Field(description="selector for target UI element.")
    locator: Optional[str] = Field(description="locator for the element")
    description: Optional[str] = Field(
        description="a short description of what the action does, e.g., 'click on the login button'",
        default="",
    )
    src_url: Optional[str] = Field(description="", default="")
    dst_url: Optional[str] = Field(description="", default="")

    @staticmethod
    def create(**kwargs):
        return Action(
            type=kwargs.get("type", "unknown"),
            input=kwargs.get("input", None),
            output=kwargs.get("output", None),
            element_id=kwargs.get("element_id", None),
            selector=kwargs.get("selector", []),
            locator=kwargs.get("locator", None),
            description=kwargs.get("description", ""),
            src_url=kwargs.get("src_url", ""),
            dst_url=kwargs.get("dst_url", ""),
        )

    @staticmethod
    def is_supported(action_type: str) -> bool:
        return action_type in [
            "call_plugin",
            "goto",
            "read_text",
            "click",
            "hover",
            "fill",
            "press",
            "selectoption",
            "check",
            "uncheck",
            "generate_answer",
            "back",
            "input",
            "drag",
            "doubleclick",
        ]

    def get_target(self):
        if self.selector and len(self.selector) > 0:
            return self.selector[0]
        elif self.locator:
            return self.locator
        elif self.element_id:
            return self.element_id

        return None

    _hash = None

    def get_hash(self):
        if not self._hash:
            self._hash = hash(f"{self.type}:{self.get_target()}")

        return self._hash

    def clean_dict(self):
        """Returns a dictionary with only non-empty values, excluding element_id"""
        return {
            k: v
            for k, v in self.model_dump(exclude_none=True).items()
            if k != "element_id" and v != "" and (not isinstance(v, (list, dict)) or len(v) > 0)
        }


# public classes
@yaml_info(yaml_tag_ns="com.project24.schema")
class Variables(BaseModel, YamlAble):
    """Contains variables that can be accessed by accessed by all actions."""

    variables: dict = Field(description="dictionary for all variables' names and values")

    @staticmethod
    def create(**kwargs):
        return Variables(variables={})

    def add(self, key: str, value: str):
        self.variables[key] = value

    def get(self, key: str) -> str:
        if key in self.variables.keys():
            return self.variables[key]
        else:
            return None


@yaml_info(yaml_tag_ns="com.project24.schema")
class Atom(BaseModel, YamlAble):
    """An atom is a group of HTML elements that together perform a single task (e.g., a search atom consists of a
    search text input and a submit button)."""

    id: str = Field(description="a short unique name")
    description: str = Field(description="A short description of what the atom is about")
    markers: List[TextMarker] = Field(description="a list of TextMarkers")
    element_ids: List[str] = Field(
        description="A list of numeric ids of all HTML elements in the atom. The id of an HTML element appears as "
        "the value of its 'id' attribute. It also appears in the screenshot as a red number inside red circles "
        "next to HTML element."
    )
    menus: List["MenuItem"] = Field(default_factory=list, description="A list of menus associated with this atom.")

    @staticmethod
    def create(**kwargs):
        x = Atom(
            id=kwargs.get("id", ""),
            description=kwargs.get("description", ""),
            markers=kwargs.get("markers", []),
            element_ids=kwargs.get("element_ids", []),
            menus=kwargs.get("menus", []),
        )
        return x

    def add_menu(self, menu: "MenuItem"):
        self.menus.append(menu)

    _hash = None

    def get_hash(self):
        if not self._hash:
            marker_list = [marker.get_hash() for marker in self.markers]
            sorted_markers = sorted(marker_list)
            menus_hash = [menu.get_hash() for menu in self.menus]
            sorted_menus = sorted(menus_hash)
            self._hash = hash(f"{sorted_markers}:{sorted_menus}")
        return self._hash


@yaml_info(yaml_tag_ns="com.project24.schema")
class State(BaseModel, YamlAble):
    """A state is a collection of atoms that appear together, such as in the same page"""

    id: str = Field(description="a short name of the state, e.g., HomePage")
    url: Optional[str] = Field(description="url of the page representing the state")
    description: str = Field(description="A description of what appears in the state")
    atoms: List[Atom] = Field(description="a list of atoms in the state")

    @staticmethod
    def create(**kwargs):
        s = State(id="", description="", url="", atoms=[])
        for key, value in kwargs.items():
            setattr(s, key, value)
        return s

    _hash = None

    def add_atom(self, atom: Atom) -> bool:
        already_exists = any(atom.get_hash() == a.get_hash() for a in self.atoms)
        if not already_exists:
            self.atoms.append(atom)
            self._hash = None
            return True
        return False

    def get_hash(self):
        if not self._hash:
            atom_hash = [x.get_hash() for x in self.atoms]
            sorted_list = sorted(atom_hash)
            self._hash = hash(str(sorted_list))
        return self._hash


class VerbFromLLM(BaseModel):
    name: str = Field(description="a short unique name")
    description: str = Field(description="a description of what the ActionGroup does")
    atom_id: str = Field(description="id of the Atom on which the subtask can be performed")
    actions: List[Action] = Field(description="sequence of actions that need to be performed")
    is_account_related: bool = Field(
        description=(
            "True if the verb is account-related (such as login, logout, signup, signin, signout, edit profile, "
            "account, etc.), False otherwise"
        )
    )


class VerbListFromLLM(BaseModel):
    verbs: List[VerbFromLLM] = Field(description="a list of VerbFromLLM objects")


class VerbDescription(BaseModel):
    name: str = Field(description="a short unique name")
    description: str = Field(description="a description of what the ActionGroup does")
    src_atom_id: str = Field(description="the id of the source atom")
    src_atom_description: str = Field(description="A short description of the atom where the verb is performed")
    src_state_id: str = Field(description="the id of the source state")
    src_state_description: str = Field(description="A description of the state that contains src_atom")
    dst_atom_id: str = Field(description="the id of the destination atom")
    dst_atom_description: str = Field(
        description="A short description of what the atom that results after the verb is performed  "
    )
    dst_state_id: str = Field(description="the id of the destination state")
    dst_state_description: str = Field(description="A description of the state that contains dst_atom")
    is_account_related: str = Field(description="True if the verb is account-related, False otherwise")
    is_predefined: str = Field(description="True if the verb is predefined, False otherwise")
    actions: List[Action] = Field(description="sequence of actions that need to be performed")

    @staticmethod
    def create(**kwargs):
        return VerbDescription(
            name="",
            description="",
            src_atom_id="",
            src_atom_description="",
            src_state_id="",
            src_state_description="",
            dst_atom_id="",
            dst_atom_description="",
            dst_state_id="",
            dst_state_description="",
            is_account_related="False",
            is_predefined="False",
            actions=[],
        )


@yaml_info(yaml_tag_ns="com.project24.schema")
class Verb(BaseModel, YamlAble):
    """A task can be performed on a single Atom with a sequence of Actions"""

    name: str = Field(description="a short unique name")
    description: str = Field(description="a description of what the ActionGroup does")
    src_atom: Atom | None = Field(description="Atom on which the subtask can be performed")
    src_state: State | None = Field(
        description="state that contains the Atom. Can be empty if the Atom can be present in multiple states."
    )
    dst_atom: Atom | None = Field(
        description="id of the atom that captures the result of performing the ActionGroup. can be empty"
    )
    dst_state: State | None = Field(description="id of the state that results after performing the verb.")
    dst_url: str | None = Field(description="url of the page that results after performing the verb")
    actions: List[Action] = Field(description="sequence of actions that need to be performed")
    is_account_related: bool = Field(
        default=False,
        description=(
            "True if the verb is account-related (such as login, logout, signup, signin, signout, edit profile, "
            "account, etc.), False otherwise"
        ),
    )
    is_predefined: bool | None = Field(
        default=False,
        description=(
            "True if the verb is predefined. A predefined verb is independent of the app's state "
            "and can be performed at any time."
        ),
    )

    @staticmethod
    def create(**kwargs):
        x = Verb(
            name="",
            description="",
            src_atom=None,
            src_state=None,
            dst_atom=None,
            dst_state=None,
            dst_url=None,
            actions=[],
            is_account_related=False,
            is_predefined=False,
        )

        for key, value in kwargs.items():
            setattr(x, key, value)
        return x

    def get_description(self):
        return VerbDescription(
            name=self.name,
            description=self.description,
            src_atom_id=self.src_atom.id if self.src_atom else "",
            src_atom_description=self.src_atom.description if self.src_atom else "",
            src_state_id=self.src_state.id if self.src_state else "",
            src_state_description=self.src_state.description if self.src_state else "",
            dst_atom_id=self.dst_atom.id if self.dst_atom else "",
            dst_atom_description=self.dst_atom.description if self.dst_atom else "",
            dst_state_id=self.dst_state.id if self.dst_state else "",
            dst_state_description=self.dst_state.description if self.dst_state else "",
            is_account_related=str(self.is_account_related) if self.is_account_related else "",
            is_predefined=str(self.is_predefined) if self.is_predefined else "",
            actions=self.actions,
        )

    _hash = None

    def get_hash(self):
        if not self._hash:
            action_hash_list = [x.get_hash() for x in self.actions]
            sorted_action_list = sorted(action_hash_list)
            action_hash = hash(str(sorted_action_list))
            self._hash = hash(f"{self.src_atom.get_hash() if self.src_atom else 0},{action_hash}")

        return self._hash


@yaml_info(yaml_tag_ns="com.project24.schema")
class VerbList(BaseModel, YamlAble):
    verbs: List[Verb] = Field(description="a list of verbs")


@yaml_info(yaml_tag_ns="com.project24.schema")
class Plugin(BaseModel, YamlAble):
    """An external tool or plugin or function that can be invoked by the agent to perform any
    application-specific logic."""

    id: str = Field(description="a unique id")
    description: str = Field(description="a description of what the plugin does, what its inputs and outputs are")
    command: str = Field(description="the command to be executed")
    input: List[str] | None = Field(description="list of input variable names")
    output: str | None = Field(description="output variable name")

    @staticmethod
    def create():
        return Plugin(id="", description="", command="", input=[], output=None)


@yaml_info(yaml_tag_ns="com.project24.schema")
class Trajectory(BaseModel, YamlAble):
    id: str = Field(description="a short unique name")
    description: str = Field(description="a short description of what the trajectory is about")
    task_examples: list[str] = Field(description="a list of task examples following the trajectory")
    actions: list[Action] = Field(description="sequence of actions that need to be performed")
    app_name: Optional[str] = Field(description="")
    content: Optional[str] = Field(
        description=(
            "a string that contains the content of the trajectory, "
            "e.g., the task description and the performed actions in a single string"
        ),
        default="",
    )
    quality_score: Optional[int] = Field(description="", default=0)

    @classmethod
    def from_obj(cls, obj: object):
        return cls(
            id=obj["id"],
            description=obj["description"],
            task_examples=obj["task_examples"],
            app_name=obj["app_name"],
            actions=obj["actions"],
            content=obj.get("content", ""),
            quality_score=obj.get("quality_score", 0),
        )

    @staticmethod
    def create(**kwargs):
        return Trajectory(
            id=kwargs.get("id", ""),
            description=kwargs.get("description", ""),
            task_examples=kwargs.get("task_examples", []),
            actions=kwargs.get("actions", []),
            app_name=kwargs.get("app_name", ""),
            content=kwargs.get("content", ""),
            quality_score=kwargs.get("quality_score", 0),
        )

    def clean_dict(self):
        """Returns a dictionary with only non-empty values, with cleaned actions"""
        data = {
            k: v
            for k, v in self.model_dump(exclude_none=True).items()
            if k != "element_id" and v != "" and (not isinstance(v, (list, dict)) or len(v) > 0)
        }
        if "actions" in data:
            data["actions"] = [action.clean_dict() for action in self.actions]
        return data


@yaml_info(yaml_tag_ns="com.project24.schema")
class AppGraph(BaseModel, YamlAble):
    """An app graph contains all states, atoms, and action groups of an application. it also contains variables and
    plugins that may be required to execute user tasks on the application."""

    name: str = Field(description="application/website name")
    description: str = Field(description="a description of what the app/website is used for")
    variables: Variables = Field("global variables for executing tasks in the app")
    plugins: List[Plugin] = Field("plugins that encapsulates app-specific logic and can be executed to perform tasks ")
    atoms: List[Atom] = Field("a list of atoms in the app")
    states: List[State] = Field("a list of states in the app")
    verbs: List[Verb] = Field("a list of action groups for the app")
    endpoint: str = Field("the endpoint of the app")
    trajectories: Optional[List[Trajectory]] = Field(default=[], description="the list of trajectories")

    @staticmethod
    def create(**kwargs):
        x = AppGraph(
            name="",
            description="",
            variables=Variables.create(),
            plugins=[],
            atoms=[],
            states=[],
            verbs=[],
            trajectories=[],
        )

        for key, value in kwargs.items():
            setattr(x, key, value)

        x.load_predefined_verbs()
        return x

    @staticmethod
    def create_from_yaml(yaml_file: str):
        LOGGER.debug(f"create from yaml file {yaml_file}")
        if not os.path.exists(yaml_file):
            raise FileNotFoundError(f"file {yaml_file} not found")

        with open(yaml_file, "r") as stream:
            LOGGER.debug(f"loading yaml file {yaml_file}")
            try:
                ag: AppGraph = yaml.safe_load(stream)
            except Exception as ex:
                print(ex)
                return None

        ag.load_predefined_verbs()
        return ag

    @staticmethod
    def create_from_json(json_file: str):
        if not os.path.exists(json_file):
            raise FileNotFoundError(f"file {json_file} not found")
        with open(json_file, "r") as stream:
            try:
                return AppGraph.model_validate_json(stream.read())
            except Exception as ex:
                print(ex)
                return None

    def serialize_yaml(self, index_file: str = None, overwrite=False) -> str:
        """
        Serialize the AppGraph to a yaml file

        args:
            index_file: str: path to the yaml file
            overwrite: bool: if True, overwrite the file if it exists
        """

        if os.path.exists(index_file) and not overwrite:
            raise FileExistsError(f"file {index_file} already exists")

        index_str: str = yaml.dump(self, default_flow_style=False, sort_keys=False)
        # index_str can be deserialized as app_graph:AppGraph = yaml.safe_load(index_str)
        if index_file:
            with open(index_file, "w") as f:
                f.write(index_str)
        return index_str

    def serialize_json(self, index_file: str = None) -> str:
        index_str: str = self.model_dump_json(indent=2)

        # convert to json and back so that the printing is nicer
        index_str = json.dumps(json.loads(index_str), indent=4)

        if index_file:
            with open(index_file, "w") as f:
                f.write(index_str)

        return index_str

    def get_verb(self, name: str):
        return next(filter(lambda x: x.name == name, self.verbs), None)

    def get_endpoint(self):
        return self.endpoint

    def add_atom(self, atom: Atom) -> Atom:
        match = next(filter(lambda x: x.get_hash() == atom.get_hash(), self.atoms), None)
        if match:
            return match
        self.atoms.append(atom)
        return atom

    def add_state_and_atom(self, state: State) -> State:
        match: State = next(filter(lambda x: x.get_hash() == state.get_hash(), self.states), None)

        if not match:
            # match on url
            match = next(filter(lambda x: x.url == state.url, self.states), None)

        if match:
            # collect new atoms in the state
            for atom in state.atoms:
                self.add_atom(atom)
                match.add_atom(next(filter(lambda x: x.get_hash() == atom.get_hash(), self.atoms), None))
            return match
        else:
            for i, atom in enumerate(state.atoms):
                state.atoms[i] = self.add_atom(atom)
            self.states.append(state)
            return state

    def add_verb(self, verb: Verb) -> Verb:
        # Check if verb already exists
        match = next(filter(lambda x: x.get_hash() == verb.get_hash(), self.verbs), None)
        if match:
            return match
        else:
            # Add src_state and its atoms if they exist and don't already match
            if verb.src_state:
                self.add_state_and_atom(verb.src_state)
                # Find matching state and update verb's reference
                verb.src_state = next(filter(lambda x: x.get_hash() == verb.src_state.get_hash(), self.states), None)

            # Add src_atom if it exists and doesn't already match
            if verb.src_atom:
                self.add_atom(verb.src_atom)
                # Find matching atom and update verb's reference
                verb.src_atom = next(filter(lambda x: x.get_hash() == verb.src_atom.get_hash(), self.atoms), None)

            # Add dst_state and its atoms if they exist and don't already match
            if verb.dst_state:
                self.add_state_and_atom(verb.dst_state)
                # Find matching state and update verb's reference
                verb.dst_state = next(filter(lambda x: x.get_hash() == verb.dst_state.get_hash(), self.states), None)

            # Add dst_atom if it exists and doesn't already match
            if verb.dst_atom:
                self.add_atom(verb.dst_atom)
                # Find matching atom and update verb's reference
                verb.dst_atom = next(filter(lambda x: x.get_hash() == verb.dst_atom.get_hash(), self.atoms), None)

            self.verbs.append(verb)
            return verb

    def add_verbs(self, verbs: List[Verb]) -> bool:
        for v in verbs:
            self.add_verb(v)

        return True

    def load_predefined_verbs(self):
        predefined_verbs_file = os.path.join(os.path.dirname(__file__), "predefined_verbs.yaml")
        verbs: list[Verb] = VerbList.load_yaml(predefined_verbs_file).verbs
        if verbs:
            self.add_verbs(verbs)

    def merge(self, other: "AppGraph"):

        # I think we can just only add the verbs, and they will add the states and atoms
        self.add_verbs(other.verbs)


class AppGraphDesc(BaseModel):
    """Short description of an app"""

    name: str = Field(description="application/website name")
    description: str = Field(desctiption="a description of what the app/website is used for")

    @staticmethod
    def create(ag: AppGraph):
        return AppGraphDesc(name=ag.name, description=ag.description)


@yaml_info(yaml_tag_ns="com.project24.schema")
class MenuItem(BaseModel, YamlAble):
    id: str
    text: str
    action: Optional[Action] = Field(description="action that need to be performed")
    element_id: Optional[str] = Field(
        description="a numeric id that appear as red numbers inside red circles next to UI element where "
        "the marker appears. MUST be extracted from the given image."
    )
    sub_items: List["MenuItem"] = Field(
        default_factory=list, description="List of child menu items representing sub-menus."
    )

    @classmethod
    def create(
        cls,
        id: str,
        text: str,
        action: Optional[Action] = None,
        sub_items: Optional[List["MenuItem"]] = [],
        element_id: Optional[str] = None,
    ) -> "MenuItem":
        return cls(id=id, text=text, action=action, sub_items=sub_items, element_id=element_id)

    def add_sub_item(self, menu_item: "MenuItem"):
        self.sub_items.append(menu_item)

    _hash = None

    def get_hash(self):
        if not self._hash:
            sub_items_hash = [item.get_hash() for item in self.sub_items]
            sorted_sub_items = sorted(sub_items_hash)
            self._hash = hash(f"{self.id}:{self.text}:{sorted_sub_items}")
        return self._hash


# Ensure that MenuItem can reference itself for sub_items
MenuItem.model_rebuild()


class LLMAtomAndVerbs(BaseModel):
    atom: Atom
    verbs: List[Verb]
